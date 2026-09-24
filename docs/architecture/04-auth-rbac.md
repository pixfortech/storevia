# 04 — Authentication and RBAC

> Milestone 0 deliverable. Status: **proposed, awaiting review**. ADR-0007, ADR-0008.

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
getSession(headers): Promise<SessionInfo | null>
requireSession(headers): Promise<SessionInfo>                  // 401/redirect
requireRecentAuth(session, maxAgeSeconds): void                 // step-up
signUp / signIn / signOut / requestPasswordReset / resetPassword / verifyEmail
listSessions / revokeSession / revokeOtherSessions
```

If Better Auth has to be replaced, only `packages/auth` changes (ADR-0007).
The organisation/membership model is Storevia's own (`packages/tenancy`), not
Better Auth's organisation plugin, because tenancy, RLS and entitlements must
be under our control.

## 3. Credential security

| Control                           | Decision                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing                  | **Argon2id** (`@node-rs/argon2`) at OWASP parameters (m = 19 MiB, t = 2, p = 1), tuned so a hash takes ~50 ms on production hardware; parameters are encoded in the hash so they can be raised later with rehash-on-login       |
| Password policy                   | 10–128 characters, no composition rules, blocked if it appears in a breached-password corpus (HIBP k-anonymity API, fail-open with logging if unavailable), not equal to the email                                              |
| Email verification                | Required before a user can create an organisation or accept an invitation. Token: 32 random bytes, stored as SHA-256 hash, single-use, 24 h TTL                                                                                 |
| Password reset                    | Same token properties, 30 min TTL, single-use; **all sessions revoked** on reset; the response is identical whether or not the email exists; notification email sent to the account                                             |
| Account enumeration               | Sign-up, sign-in and reset responses and timings do not reveal whether an email is registered (sign-up of an existing address sends a "you already have an account" email instead)                                              |
| Brute force / credential stuffing | Rate limits per IP, per email and globally (sliding window); progressive delays; after N failures for an account, require a CAPTCHA/challenge (Turnstile) rather than locking the victim out; edge WAF bot rules in front       |
| Reset/verification token abuse    | Per-email and per-IP limits on token issuance; old tokens invalidated when a new one is issued                                                                                                                                  |
| Google sign-in                    | OAuth 2.0 / OIDC with PKCE + `state` + `nonce`; accounts are linked only when the Google email is verified **and** matches a verified Storevia email, otherwise the user must sign in with a password first and link explicitly |

## 4. Sessions and cookies

| Property        | Value                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage         | Server-side `Session` rows; cookie holds a random 256-bit token; the DB stores only its SHA-256 hash                                                                                         |
| Cookie          | `__Host-storevia.session`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain` (host-only)                                                                                           |
| Platform cookie | `__Host-storevia-admin.session` on the admin host, `SameSite=Strict`                                                                                                                         |
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

1. **Code checks permissions, never role names.** `authorize(ctx,
"product.update")`, not `if (role === "ADMIN")`.
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

| Area         | Permissions                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation | `organisation.read`, `organisation.update`, `organisation.delete`, `ownership.transfer`, `audit.read`                                           |
| Members      | `member.read`, `member.manage`                                                                                                                  |
| Billing      | `billing.read`, `billing.manage`                                                                                                                |
| Stores       | `store.create`, `store.read`, `store.update`, `store.archive`, `settings.manage`                                                                |
| Catalogue    | `product.read`, `product.create`, `product.update`, `product.delete`, `collection.manage`, `inventory.read`, `inventory.adjust`, `media.manage` |
| Orders       | `order.read`, `order.manage`, `order.refund`, `customer.read`, `customer.manage`                                                                |
| Marketing    | `discount.read`, `discount.manage`, `analytics.read`                                                                                            |
| Website      | `design.edit`, `page.publish`, `theme.publish`, `navigation.manage`, `domain.manage`                                                            |
| Developers   | `api_key.manage`, `webhook.manage`                                                                                                              |

### 7.3 Role matrix

✔ = granted. OWNER has every permission.

| Permission                      | OWNER | ADMIN | STORE_MANAGER | DESIGNER | CATALOGUE_MANAGER | ORDER_MANAGER | MARKETING | SUPPORT | VIEWER |
| ------------------------------- | :---: | :---: | :-----------: | :------: | :---------------: | :-----------: | :-------: | :-----: | :----: |
| organisation.read               |   ✔   |   ✔   |       ✔       |    ✔     |         ✔         |       ✔       |     ✔     |    ✔    |   ✔    |
| organisation.update             |   ✔   |   ✔   |               |          |                   |               |           |         |        |
| organisation.delete             |   ✔   |       |               |          |                   |               |           |         |        |
| ownership.transfer              |   ✔   |       |               |          |                   |               |           |         |        |
| audit.read                      |   ✔   |   ✔   |               |          |                   |               |           |         |        |
| member.read                     |   ✔   |   ✔   |       ✔       |          |                   |               |           |         |        |
| member.manage                   |   ✔   |   ✔   |               |          |                   |               |           |         |        |
| billing.read                    |   ✔   |   ✔   |               |          |                   |               |           |         |        |
| billing.manage                  |   ✔   |       |               |          |                   |               |           |         |        |
| store.create                    |   ✔   |   ✔   |               |          |                   |               |           |         |        |
| store.read                      |   ✔   |   ✔   |       ✔       |    ✔     |         ✔         |       ✔       |     ✔     |    ✔    |   ✔    |
| store.update / settings.manage  |   ✔   |   ✔   |       ✔       |          |                   |               |           |         |        |
| store.archive                   |   ✔   |   ✔   |               |          |                   |               |           |         |        |
| product.read / inventory.read   |   ✔   |   ✔   |       ✔       |    ✔     |         ✔         |       ✔       |     ✔     |    ✔    |   ✔    |
| product.create / update         |   ✔   |   ✔   |       ✔       |          |         ✔         |               |           |         |        |
| product.delete                  |   ✔   |   ✔   |       ✔       |          |         ✔         |               |           |         |        |
| collection.manage               |   ✔   |   ✔   |       ✔       |          |         ✔         |               |     ✔     |         |        |
| inventory.adjust                |   ✔   |   ✔   |       ✔       |          |         ✔         |       ✔       |           |         |        |
| media.manage                    |   ✔   |   ✔   |       ✔       |    ✔     |         ✔         |               |     ✔     |         |        |
| order.read                      |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |           |    ✔    |   ✔    |
| order.manage                    |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |           |         |        |
| order.refund                    |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |           |         |        |
| customer.read                   |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |     ✔     |    ✔    |        |
| customer.manage                 |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |           |    ✔    |        |
| discount.read                   |   ✔   |   ✔   |       ✔       |          |                   |       ✔       |     ✔     |    ✔    |   ✔    |
| discount.manage                 |   ✔   |   ✔   |       ✔       |          |                   |               |     ✔     |         |        |
| analytics.read                  |   ✔   |   ✔   |       ✔       |          |                   |               |     ✔     |         |   ✔    |
| design.edit                     |   ✔   |   ✔   |       ✔       |    ✔     |                   |               |     ✔     |         |        |
| page.publish                    |   ✔   |   ✔   |       ✔       |    ✔     |                   |               |           |         |        |
| theme.publish                   |   ✔   |   ✔   |       ✔       |    ✔     |                   |               |           |         |        |
| navigation.manage               |   ✔   |   ✔   |       ✔       |    ✔     |                   |               |     ✔     |         |        |
| domain.manage                   |   ✔   |   ✔   |               |          |                   |               |           |         |        |
| api_key.manage / webhook.manage |   ✔   |   ✔   |               |          |                   |               |           |         |        |

Notes:

- VIEWER is read-only and does not see customer PII.
- SUPPORT can view orders and edit customer records (address changes,
  notes), but cannot refund or manage orders.
- MARKETING can edit pages (`design.edit`) but cannot publish them, so a
  designer or manager reviews and publishes.

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
  and expire after 7 days.
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
