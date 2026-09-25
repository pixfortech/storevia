# 04 — Authentication and RBAC

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**. ADR-0007, ADR-0008.

## 1. Identity realms

Storevia has three identity populations. They never share sessions or tables.

| Realm                   | Who                                       | Tables                                                     | Where sessions are valid  |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| **Dashboard**           | Merchant users                            | `User`, `Account`, `Session(realm=DASHBOARD)`              | `app.storevia.com` only   |
| **Platform**            | Storevia staff (`User` + `PlatformStaff`) | same `User`, `Session(realm=PLATFORM)`                     | `admin.storevia.com` only |
| **Customer** (after M6) | Storefront shoppers                       | `Customer` + a separate credential/session table per store | the store's own host only |

A Storevia employee who is also a merchant uses the same `User` but holds two
different sessions on two different hosts.

## 2. Framework: Better Auth, wrapped

Better Auth (pinned 1.7.x) provides the protocol machinery: credential
sign-up/sign-in, email verification, password reset, DB-backed sessions,
OAuth providers, rate limiting, and plugins for TOTP 2FA, passkeys and
SSO. It is used **only inside `packages/auth`**. Apps call Storevia's own API:

```ts
// packages/auth: one AuthService per realm (DASHBOARD, PLATFORM)
service.getSession(headers): Promise<AuthSession | null>     // realm, lifetime and status checks
service.refreshSession(headers)                              // sliding expiry, used by the proxy
service.signUp / signIn / signOut / verifyEmail / resendVerification
service.requestPasswordReset / resetPassword / changePassword
service.listSessions / revokeSession / revokeOtherSessions
service.confirmPassword(session, password)                   // step-up: stamps reauthenticatedAt
hasRecentAuth(session, maxAgeSeconds = 600): boolean
```

Apps wrap these in `requireSession()` helpers that redirect to sign-in.

Better Auth's catch-all HTTP handler is **not mounted**. Every flow goes
through `AuthService` from server actions, so validation, rate limiting and
auditing can't be bypassed by calling Better Auth endpoints directly.
Sessions are refreshed (sliding expiry) in the Next.js request proxy, where
cookies can be written.

If Better Auth has to be replaced, only `packages/auth` changes (ADR-0007).
The organisation/membership model is Storevia's own (`packages/tenancy`), not
Better Auth's organisation plugin, because tenancy, RLS and entitlements must
be under our control.

## 3. Credential security

| Control                           | Decision                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Password hashing                  | **Argon2id** (`@node-rs/argon2`) at OWASP parameters (m = 19 MiB, t = 2, p = 1), tuned so a hash takes ~50 ms on production hardware; parameters are encoded in the hash so they can be raised later with rehash-on-login                                    |
| Password policy                   | 10–128 characters, no composition rules, blocked if it appears in a breached-password corpus (HIBP k-anonymity API, fail-open with logging if unavailable), not equal to the email                                                                           |
| Email verification                | Required **before sign-in** (ADR-0021). The link carries a signed token issued by Better Auth that expires after 24 h. Verifying twice is harmless. Resends are rate-limited per email                                                                       |
| Password reset                    | Random token, stored **hashed** (`Verification.identifier`), 30 min TTL, single-use; **all sessions revoked** on reset; the response is identical whether or not the email exists; a "password changed" email is sent                                        |
| Account enumeration               | Sign-up, sign-in and reset responses and timings do not reveal whether an email is registered (sign-up of an existing address sends a "you already have an account" email instead)                                                                           |
| Brute force / credential stuffing | Fixed-window limits in PostgreSQL (`RateLimit`) per IP (only from the trusted edge header) and per account, on sign-in, sign-up, reset, verification and step-up; edge WAF bot rules in front. A CAPTCHA challenge after repeated failures is planned for M8 |
| Reset/verification token abuse    | Per-email and per-IP limits on issuance and redemption; reset tokens are single-use                                                                                                                                                                          |
| Google sign-in                    | Not enabled in Milestone 1 (issue M1-09). When added: OAuth 2.0 / OIDC with PKCE + `state` + `nonce`; accounts are linked only when the Google email is verified **and** matches a verified Storevia email                                                   |

## 4. Sessions and cookies

| Property        | Value                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage         | Server-side `Session` rows. The cookie holds the session token plus an HMAC-SHA256 signature made with the realm secret. Only the system role can read `Session` (ADR-0021)                  |
| Cookie          | `__Host-storevia.session_token`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain` (host-only). Local HTTP development uses `storevia.session_token`                               |
| Platform cookie | `__Host-storevia-admin.session_token` on the admin host, `SameSite=Strict`, separate secret                                                                                                  |
| Lifetime        | 30 days absolute; 7 days idle (sliding refresh at most once per hour); platform realm: 12 h absolute, 30 min idle                                                                            |
| Fixation        | A new session token is issued on every sign-in, privilege change (MFA completed) and password change; pre-auth tokens are never promoted                                                     |
| Revocation      | Users can see and revoke sessions (device, IP, last seen) on the account security page; sign-out deletes the row                                                                             |
| Step-up         | Sensitive actions (billing changes, ownership transfer, domain changes, API key creation, organisation deletion, member role changes to ADMIN) require `reauthenticatedAt` within 10 minutes |
| Assurance level | `mfaVerifiedAt` on the session; policies can require MFA per organisation (enterprise) and always for the platform realm                                                                     |

## 5. CSRF

- Dashboard mutations use Next.js Server Actions (POST, same-origin, and Next
  checks the `Origin` header against the host). Custom route handlers that
  accept cookies verify `Origin`/`Sec-Fetch-Site` explicitly through a shared
  helper.
- `SameSite=Lax` cookies are not sent on cross-site POSTs.
- Better Auth endpoints enforce `trustedOrigins`.
- The `/api/v1` surface accepts **only** `Authorization: Bearer` credentials
  and ignores cookies, so CSRF does not apply there.
- Every state change is a POST/PUT/PATCH/DELETE. GET handlers never mutate.

## 6. Future authentication (architecture reserved now)

| Capability                  | Hook in the design                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| MFA (TOTP + recovery codes) | Better Auth two-factor plugin; `Session.mfaVerifiedAt`; organisation policy "require MFA for members"                      |
| Passkeys (WebAuthn)         | Better Auth passkey plugin; stored as additional `Account`/credential rows                                                 |
| Enterprise SSO (SAML/OIDC)  | Better Auth SSO plugin; organisation-level verified-domain + IdP config; SSO-only enforcement per organisation; SCIM later |
| Platform staff SSO          | Corporate IdP (OIDC) for the platform realm in production; required before `platform-admin` is deployed to production      |

## 7. RBAC

### 7.1 Principles

1. **Code checks permissions, never role names.** `authorize(ctx, "product.update")`, not `if (role === "ADMIN")`.
2. Roles are **named sets of permissions**, defined in one typed map in
   `packages/tenancy/src/rbac.ts`. The map is the single source of truth for
   the dashboard UI (hiding controls), the server (enforcement) and the
   generated permission test matrix.
3. API keys and future apps get **scopes**, which map onto the same
   permission primitives.
4. Store access is a separate dimension from role: a membership may be
   limited to specific stores.
5. Custom roles (a `Role` table with permission sets) are a later enterprise
   feature behind the `advanced_permissions` entitlement. The permission
   primitives are designed so custom roles need no enforcement changes.

### 7.2 Permission catalogue (initial)

| Area         | Permissions                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation | `organisation.read`, `organisation.update`, `organisation.delete`, `ownership.transfer`, `audit.read`                                                                                                |
| Members      | `member.read`, `member.manage`                                                                                                                                                                       |
| Billing      | `billing.read`, `billing.manage`                                                                                                                                                                     |
| Stores       | `store.create`, `store.read`, `store.update`, `store.archive`, `settings.manage`                                                                                                                     |
| Catalogue    | `product.read`, `product.create`, `product.update`, `product.archive`, `collection.read`, `collection.manage`, `inventory.read`, `inventory.adjust`, `location.manage`, `media.read`, `media.manage` |
| Orders       | `order.read`, `order.manage`, `order.refund`, `customer.read`, `customer.manage`                                                                                                                     |
| Marketing    | `discount.read`, `discount.manage`, `analytics.read`                                                                                                                                                 |
| Website      | `design.edit`, `page.publish`, `theme.publish`, `navigation.manage`, `domain.manage`                                                                                                                 |
| Developers   | `api_key.manage`, `webhook.manage`                                                                                                                                                                   |

### 7.3 Role matrix

✔ = granted. OWNER has every permission.

| Permission                                                   | OWNER | ADMIN | STORE_MANAGER | DESIGNER | CATALOGUE_MANAGER | ORDER_MANAGER | MARKETING | SUPPORT | VIEWER | INVENTORY_MANAGER | SITE_MANAGER | CONTENT_MANAGER | EDITOR | AUTHOR |
| ------------------------------------------------------------ | :---: | :---: | :-----------: | :------: | :---------------: | :-----------: | :-------: | :-----: | :----: | :---------------: | :----------: | :-------------: | :----: | :----: |
| organisation.read                                            |   ✔   |   ✔   |       ✔       |    ✔     |         ✔         |       ✔       |     ✔     |    ✔    |   ✔    |         ✔         |      ✔       |        ✔        |   ✔    |   ✔    |
| organisation.update                                          |   ✔   |   ✔   |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| organisation.delete                                          |   ✔   |       |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| ownership.transfer                                           |   ✔   |       |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| audit.read                                                   |   ✔   |   ✔   |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| member.read                                                  |   ✔   |   ✔   |       ✔       |          |                   |               |           |         |        |                   |      ✔       |                 |        |        |
| member.manage                                                |   ✔   |   ✔   |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| billing.read                                                 |   ✔   |   ✔   |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| billing.manage                                               |   ✔   |       |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| store.create                                                 |   ✔   |   ✔   |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| store.read                                                   |   ✔   |   ✔   |       ✔       |    ✔     |         ✔         |       ✔       |     ✔     |    ✔    |   ✔    |         ✔         |      ✔       |        ✔        |   ✔    |   ✔    |
| store.update / settings.manage                               |   ✔   |   ✔   |       ✔       |          |                   |               |           |         |        |                   |      ✔       |                 |        |        |
| store.archive                                                |   ✔   |   ✔   |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| product.read / inventory.read / collection.read / media.read |   ✔   |   ✔   |       ✔       |    ✔     |         ✔         |       ✔       |     ✔     |    ✔    |   ✔    |         ✔         |      ✔       |        ✔        |   ✔    |   ✔    |
| product.create / product.update                              |   ✔   |   ✔   |       ✔       |          |         ✔         |               |           |         |        |                   |              |                 |        |        |
| product.archive                                              |   ✔   |   ✔   |       ✔       |          |         ✔         |               |           |         |        |                   |              |                 |        |        |
| collection.manage                                            |   ✔   |   ✔   |       ✔       |          |         ✔         |               |     ✔     |         |        |                   |              |                 |        |        |
| inventory.adjust                                             |   ✔   |   ✔   |       ✔       |          |         ✔         |       ✔       |           |         |        |         ✔         |              |                 |        |        |
| location.manage                                              |   ✔   |   ✔   |       ✔       |          |                   |               |           |         |        |         ✔         |              |                 |        |        |
| media.manage                                                 |   ✔   |   ✔   |       ✔       |    ✔     |         ✔         |               |     ✔     |         |        |                   |      ✔       |        ✔        |   ✔    |   ✔    |
| order.read                                                   |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |           |    ✔    |        |                   |              |                 |        |        |
| order.manage                                                 |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |           |         |        |                   |              |                 |        |        |
| order.refund                                                 |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |           |         |        |                   |              |                 |        |        |
| customer.read                                                |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |     ✔     |    ✔    |        |                   |              |                 |        |        |
| customer.manage                                              |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |           |    ✔    |        |                   |              |                 |        |        |
| discount.read                                                |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |     ✔     |    ✔    |   ✔    |                   |              |                 |        |        |
| discount.manage                                              |   ✔   |   ✔   |       ✔       |          |                   |               |     ✔     |         |        |                   |              |                 |        |        |
| analytics.read                                               |   ✔   |   ✔   |       ✔       |          |                   |               |     ✔     |         |   ✔    |                   |      ✔       |        ✔        |        |        |
| design.edit                                                  |   ✔   |   ✔   |       ✔       |    ✔     |                   |               |     ✔     |         |        |                   |      ✔       |        ✔        |   ✔    |   ✔    |
| page.publish                                                 |   ✔   |   ✔   |       ✔       |    ✔     |                   |               |           |         |        |                   |      ✔       |        ✔        |   ✔    |        |
| theme.publish                                                |   ✔   |   ✔   |       ✔       |    ✔     |                   |               |           |         |        |                   |      ✔       |                 |        |        |
| navigation.manage                                            |   ✔   |   ✔   |       ✔       |    ✔     |                   |               |     ✔     |         |        |                   |      ✔       |        ✔        |        |        |
| domain.manage                                                |   ✔   |   ✔   |               |          |                   |               |           |         |        |                   |              |                 |        |        |
| api_key.manage / webhook.manage                              |   ✔   |   ✔   |               |          |                   |               |           |         |        |                   |              |                 |        |        |

Notes:

- VIEWER is read-only and never sees shopper PII: it has neither
  `customer.read` nor `order.read` (orders carry emails, phones and
  addresses). Aggregates come through `analytics.read`.
- SUPPORT can view orders and edit customer records (address changes,
  notes), but cannot refund or manage orders.
- MARKETING can edit pages (`design.edit`) but cannot publish them, so a
  designer or manager reviews and publishes.
- INVENTORY_MANAGER, SITE_MANAGER, CONTENT_MANAGER, EDITOR and AUTHOR back
  the business-type role presets (ADR-0024). AUTHOR can write but not
  publish. Until the publishing module adds finer primitives, posts use
  `design.edit` (write) and `page.publish` (publish). A preset never grants
  more than its role.

### 7.4 Membership invariants

- Exactly one `OWNER` per organisation (DB partial unique index + service).
- The OWNER cannot be removed, demoted or suspended by anyone. Ownership moves
  only through `transferOwnership()`, which requires the owner's step-up
  re-authentication and an ADMIN target; the previous owner becomes ADMIN.
- A member can only assign roles whose permission set is a **subset of their
  own** (ADMIN can create ADMINs but not OWNERs). Nobody can change their own
  role.
- Invitations carry a role and are accepted only by a signed-in user whose
  verified email matches the invitation email. Tokens are hashed, single-use
  and expire after 7 days. When an invitation is accepted, the inviter must
  **still** be an active member entitled to grant that role. Removing,
  suspending or changing the role of an inviter revokes their pending
  invitations.
- Granting the ADMIN role (by invitation or role change) requires step-up
  re-authentication.
- Store scope never widens: only members with all-store access can grant
  all-store access or send invitations (which grant all stores). A
  store-limited member can grant only stores they can access themselves.
- Membership changes are conditional writes on the state that was checked
  (race-safe), and the database enforces one active OWNER per organisation.
- Every membership change (invite, accept, role change, removal, ownership
  transfer) writes an audit event.

### 7.5 Enforcement points

| Where                           | How                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server actions / route handlers | `authorize(ctx, permission)` at the top of every handler; a typed wrapper `storeAction(permission, schema, handler)` makes it impossible to write a store action without choosing a permission |
| Domain services                 | Receive the `TenantContext` and re-check the permission for multi-step operations (defence in depth, cheap because permissions are a set lookup)                                               |
| UI                              | Uses the same map to hide or disable controls. This is a convenience only and is never relied on                                                                                               |
| API                             | Scopes → permissions at key resolution; handlers call the same `authorize`                                                                                                                     |
| Tests                           | The role matrix above is generated from `rbac.ts` in a snapshot test, so a permission change shows up in review                                                                                |
