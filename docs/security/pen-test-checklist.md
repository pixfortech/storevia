# Penetration test checklist

This checklist defines the scope and the checks for the pre-launch
penetration test (threat-model Q-S4). It has two uses:

- An external tester works from it against **staging**.
- The team runs the internal pre-checks before every release that touches
  auth, tenancy, checkout, domains or platform-admin.

Every item names what "pass" means. Where an automated test already
proves an item, the test is listed so the tester can spend their time
elsewhere. A manual finding that contradicts a listed test is a
**critical** bug: the test is wrong.

## Rules of engagement

- **Target:** staging only (`*.staging.storevia.site`, staging dashboard
  and platform-admin, staging marketing). Never production.
- **Payments:** the Test provider, or Razorpay **test mode** keys. No real
  cards and no live keys.
- **Accounts:** the tester gets two organisations with two stores each,
  one member of every role in organisation A, and platform staff accounts
  with the SUPPORT and READ_ONLY roles. SUPER_ADMIN is kept back unless the
  test covers it explicitly.
- **Load:** don't load-test beyond the rate limits. Flooding checks stop at
  the first 429.
- **Reporting:** findings go to the security contact in
  `docs/operations/launch-checklist.md` and never to a public tracker. Each
  finding records the severity (CVSS 3.1), the request/response pairs, and
  whether data from another tenant was exposed.

## 1. Tenant isolation (critical)

| #   | Check                                                                                                                                      | Pass                                               | Automated                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------ |
| 1.1 | As org A, request every dashboard route with org B's or store B's ids: pages, server actions (replayed with swapped ids), uploads, exports | 404 or "no permission"; nothing from B is returned | `isolation.spec.ts`, `tenancy/isolation.int.test.ts`, database RLS tests |
| 1.2 | A store-limited member requests a sibling store in the same organisation                                                                   | 404                                                | tenancy isolation tests                                                  |
| 1.3 | Storefront of store A: `/sv/{B}`, crafted `Host`, `x-storevia-*` headers, and preview tokens from B                                        | 404; no data from B                                | `storefront.spec.ts`, site-engine pipeline tests                         |
| 1.4 | Checkout token or cookie from store A replayed on store B's host                                                                           | Refused; no order, customer or payment data        | `checkout-orders.int.test.ts`                                            |
| 1.5 | Order link (`/orders/view/…`) for store A opened on store B's host; tampered token                                                         | 404                                                | `order-operations.int.test.ts`                                           |
| 1.6 | Media: request another store's upload key, raw upload, or `/_media` path                                                                   | 404 or 403; raw uploads are never served           | media tests                                                              |
| 1.7 | The audit log viewer with `?before=` or `?area=` fuzzing                                                                                   | Only the caller's organisation, never an error     | `tenancy/activity.int.test.ts`                                           |

## 2. Authentication and sessions

| #    | Check                                                                                                                      | Pass                                                                                              | Automated                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 2.1  | Password brute force on dashboard and platform-admin sign-in                                                               | 429 after the limit; the victim can still sign in from their client                               | `auth/auth.int.test.ts` (lockout)            |
| 2.2  | Dashboard sign-in failures for a staff email                                                                               | Platform-admin sign-in unaffected (separate realm)                                                | `auth/auth.int.test.ts`                      |
| 2.3  | Account enumeration: sign-in, sign-up, reset, resend verification                                                          | Same response and similar timing for known and unknown emails                                     | auth tests                                   |
| 2.4  | Reset and verification tokens: reuse, expiry, the token of another account                                                 | Single use, expired refused, sessions revoked on reset                                            | auth tests                                   |
| 2.5  | Cookies                                                                                                                    | `__Host-`, HttpOnly, Secure, host-only; SameSite=Strict for platform-admin, Lax for the dashboard | `headers.spec.ts`, `sessions.spec.ts`        |
| 2.6  | Session fixation: set a session cookie before sign-in                                                                      | A new token after sign-in                                                                         | auth tests                                   |
| 2.7  | Platform staff: password without the second factor                                                                         | No admin page or action opens                                                                     | `admin-shell.spec.ts` (MFA)                  |
| 2.8  | TOTP: reuse a code, an old code, a code from another account, guessing past the limit, reused recovery code                | Refused; 10 attempts / 15 min; each recovery code works once                                      | `auth/auth.int.test.ts`, `auth/totp.test.ts` |
| 2.9  | Enrol a new authenticator from an existing session                                                                         | Not possible once enrolled                                                                        | `auth/auth.int.test.ts`                      |
| 2.10 | Step-up: refund, payment connection change, domain removal and granting Admin with a session older than the step-up window | Refused until the password is confirmed                                                           | commerce, tenancy and roles tests            |

## 3. Authorisation

| #   | Check                                                                                         | Pass                                         | Automated                                                 |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| 3.1 | Each role replays every server action it can't see in the UI (captured from an owner session) | "You don't have permission"; nothing changes | `roles.spec.ts` (crafted replay), permission matrix tests |
| 3.2 | Self-promotion: change own role, grant a role above one's own, remove the last owner          | Refused                                      | tenancy member tests                                      |
| 3.3 | Merchant reaches platform-admin routes or actions with a dashboard cookie                     | Refused                                      | T11                                                       |
| 3.4 | Plan bypass: exceed a limit concurrently (stores, products, members, storage)                 | The limit holds under concurrency            | entitlement concurrency tests                             |
| 3.5 | READ_ONLY staff open jobs, domains and the audit log                                          | "You can't view…" pages; no data             | `admin-shell.spec.ts`, `billing/audit-admin.int.test.ts`  |

## 4. Checkout and payments

| #   | Check                                                                                               | Pass                                                              | Automated                            |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| 4.1 | Tamper with prices, quantities, shipping rate, discount or currency in any request                  | Server re-prices; payment only for the reviewed quote             | checkout tests                       |
| 4.2 | Return page with forged query parameters                                                            | No order without a verified webhook or provider API confirmation  | E2E checkout                         |
| 4.3 | Webhook: unsigned, wrong secret, another store's secret, tampered body, old timestamp, 64 KiB+ body | 401/400; nothing applied                                          | `commerce/checkout.int.test.ts`      |
| 4.4 | Webhook replay: same event id; same content under a new event id                                    | Duplicate; one order                                              | `commerce/checkout.int.test.ts` (S6) |
| 4.5 | Flood forged deliveries from one address                                                            | That sender is throttled; the provider's delivery still applies   | `commerce/checkout.int.test.ts` (S7) |
| 4.6 | Discount guessing with rotating IPs or no IP header                                                 | Stops at the per-checkout and per-store limits                    | `commerce/checkout.int.test.ts` (S1) |
| 4.7 | Concurrent final use of a discount, last unit of stock, double capture, concurrent full refunds     | Invariants hold (one use, no oversell, one order, no over-refund) | race tests                           |
| 4.8 | Payment credentials: read back from settings, logs or HTML                                          | Only a masked hint                                                | settings view test, log review       |
| 4.9 | Test provider or mock billing reachable on staging with the flag off, and in a production build     | 404                                                               | registry tests                       |

## 5. Domains and storefront

| #   | Check                                                                                                  | Pass                                                                   | Automated                          |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------- |
| 5.1 | Add a hostname another store has ACTIVE                                                                | Refused                                                                | `tenancy/domains.int.test.ts`      |
| 5.2 | Add a hostname you don't control                                                                       | Never registered with the hosting provider; never ACTIVE               | `tenancy/domains.int.test.ts` (S2) |
| 5.3 | Squat a hostname (add, never verify) and let its owner add it after 72 h                               | The owner's store takes it                                             | `tenancy/domains.int.test.ts`      |
| 5.4 | Remove a domain, then point DNS at the platform from another account                                   | No takeover: re-verification needed                                    | lifecycle tests                    |
| 5.5 | Cookie tossing from `a.storevia.site` to `b.storevia.site`                                             | Host-only cookies; PSL listing (owner action) completes the protection | E2E cart cookie                    |
| 5.6 | Cache poisoning: `Host`, `X-Forwarded-Host`, unkeyed headers, query-string variants                    | Responses keyed and resolved from `StoreDomain` rows only              | storefront tests                   |
| 5.7 | Forged cache invalidation post                                                                         | Refused (HMAC, window, well-formed tags)                               | `revalidate/route.test.ts`         |
| 5.8 | Suspended store, unpublished page or old primary domain served from a second instance after the change | Gone within about a second on every instance                           | invalidation integration test      |

## 6. Content and injection

| #   | Check                                                                                                          | Pass                                                          | Automated                         |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------- |
| 6.1 | Script, HTML, `javascript:` and `data:` URLs through every text field, page block, menu link and theme setting | Rendered as text or refused; CSP blocks inline script         | editor and commerce tests         |
| 6.2 | SQL injection through search, filters, sort, cursors and CSV import                                            | No error leakage; parameterised queries only                  | lint (`$executeRawUnsafe` banned) |
| 6.3 | Uploads: polyglots, SVG with script, oversized, wrong content type, decompression bombs                        | Refused or re-encoded; raw never served; sandbox CSP on media | media tests                       |
| 6.4 | CSV import: formula injection (`=`, `+`, `-`, `@`) in exported files                                           | Neutralised on export                                         | `commerce/catalogue.int.test.ts`  |
| 6.5 | Open redirects: `next`, `returnTo`, preview and sign-in redirects                                              | Only same-app relative paths                                  | `safeRedirectPath` tests          |
| 6.6 | CSRF: server actions from a foreign origin                                                                     | Refused (Origin check)                                        | forged-origin test                |

## 7. Headers and transport

| #   | Check                                                                   | Pass                                                                                                                                    | Automated                     |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 7.1 | Response headers on every app                                           | CSP with nonce and `strict-dynamic` (no `*`), `frame-ancestors 'none'`, nosniff, COOP; CORP same-origin on dashboard and platform-admin | `headers.spec.ts`, unit       |
| 7.2 | HSTS on Storevia-owned hosts; not `includeSubDomains` on custom domains | As in threat-model §5                                                                                                                   | manual                        |
| 7.3 | TLS: protocol versions and ciphers                                      | TLS 1.2+ only (hosting provider default)                                                                                                | manual (SSL Labs A or better) |

## 8. Data exposure and logging

| #   | Check                                                                   | Pass                                                               | Automated                       |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| 8.1 | Error pages and responses for 4xx/5xx                                   | No stack traces, SQL or internal ids beyond the request id         | `onRequestError` tests          |
| 8.2 | Logs during a full checkout, refund and MFA sign-in (staging log drain) | No emails, tokens, secrets, card-like numbers or order-link tokens | observability tests (scrubbing) |
| 8.3 | Audit logs in both viewers                                              | No IPs, user agents or unmasked emails                             | activity and audit-admin tests  |
| 8.4 | Browser bundles                                                         | No server secrets or `server-only` modules                         | build checks                    |

## 9. Availability

| #   | Check                                                                                   | Pass                                                      |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 9.1 | Search, export, notifications poll, webhooks, sign-in, resend verification at the limit | 429 at the documented limit, others unaffected            |
| 9.2 | Oversized bodies and documents (page builder, imports, webhooks)                        | Refused before expensive work                             |
| 9.3 | Worker: a job that hangs, a poison outbox event, a crashed worker mid-run               | Timeout, skip and lease recovery; alerts fire (alerts.md) |

## Before each release (internal)

1. Run the full gate (`docs/engineering`): unit, integration, E2E, gitleaks.
2. Re-run sections 1, 2.7–2.10, 4.3–4.6 and 5.1–5.3 by hand on staging when
   the release touches those areas.
3. Check that no new route, server action or webhook lacks a permission
   check, a rate limit or an audit entry. Every new server action must be
   in the permission matrix tests.
