# ADR-0021: Better Auth integration details (session storage, realms, verification)

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0007 (does not supersede it)

## Context

ADR-0007 chose Better Auth. Implementing it in Milestone 1 showed that three
details in `docs/architecture/04-auth-rbac.md` don't match how Better Auth
1.7 works:

1. **Session token storage.** Doc 04 §4 says the database stores only a
   SHA-256 hash of the session token. Better Auth stores the session token
   itself in `Session.token` and looks it up by that value. In exchange, the
   cookie it sets is `token.HMAC-SHA256(secret, token)`, and a request is
   authenticated only when the signature verifies. Hashing the column would
   mean patching Better Auth's adapter, which is fragile.
2. **Verification secrets.** Better Auth can store verification identifiers
   hashed (`verification.storeIdentifier: "hashed"`), but its column names
   differ from the draft's `valueHash`.
3. **Realms.** Better Auth has no realm concept. We need separate dashboard and
   platform sessions.

## Decision

1. **Keep Better Auth's session storage** (`Session.token`), and compensate:
   - Cookies are HMAC-signed with a per-realm secret (`AUTH_SECRET`,
     `AUTH_PLATFORM_SECRET`). Someone who can read the database but doesn't
     have the secret can't produce a valid cookie.
   - The app role (`storevia_app`) has **no privileges** on `Session`,
     `Account` or `Verification`. Only the system role, used exclusively by
     `packages/auth`, can read them.
   - Secrets live in the secrets manager, never next to database credentials.

   The residual risk is someone who holds both a database dump and the auth
   secret. We accept it for now. Revisit if Better Auth adds hashed session
   storage, or by wrapping the adapter once there are tests to prove the
   wrapper.

2. **Verification identifiers are stored hashed** (`storeIdentifier:
"hashed"`). The draft's `Verification` model is updated to Better Auth's
   shape (`identifier`, `value`).
3. **Realms** come from two Better Auth instances. The dashboard instance runs
   on the dashboard host with cookie prefix `storevia`. The platform instance
   runs on the admin host with cookie prefix `storevia-admin`, uses a
   different secret, and has sign-up disabled. Each instance writes
   `Session.realm` (an additional field with a fixed default). Each app
   rejects sessions whose realm doesn't match, and the platform instance
   refuses to create a session for users without an active `PlatformStaff`
   row.
4. **Email verification is required before sign-in**
   (`requireEmailVerification: true`), which is stricter than doc 04, where
   verification was required only before creating an organisation. Duplicate
   sign-ups get Better Auth's generic response, and the existing user receives
   an "account already exists" email (`onExistingUserSignUp`), so sign-up
   doesn't reveal which emails are registered.
5. Passwords use Argon2id through Better Auth's `password.hash/verify` hooks,
   as ADR-0007 specifies.
6. `RateLimit` (Better Auth's database-backed rate limiter) becomes an
   Identity-scope table in the draft schema.

## Consequences

- Doc 04 §3–§4, the draft schema (`Session`, `Verification`, `RateLimit`) and
  the ERD are updated to match.
- The session-token compensation depends on grants and secret separation,
  and integration tests check the grants.
