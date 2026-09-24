# ADR-0007: Authentication with Better Auth, wrapped in packages/auth

- Status: Accepted
- Date: 2026-09-24

## Context

The spec prefers Auth.js "or an equally appropriate production authentication
framework" and forbids preview dependencies for foundations. As of 2026-09,
Auth.js v5 (the App Router version) is still published as `beta`, and v4
targets the Pages-era API.

## Decision

- Use **Better Auth 1.7.x** (stable, pinned) for email/password,
  verification, password reset, database sessions, rate limiting, Google
  OAuth, and later TOTP/passkeys/SSO via its plugins.
- Wrap it entirely inside `packages/auth`. Apps use Storevia's own functions
  (`getSession`, `requireSession`, `requireRecentAuth`, …).
- Passwords hashed with **Argon2id** (custom hash/verify hooks).
- Server-side sessions; cookie tokens stored as hashes; host-only `__Host-`
  cookies; separate realms and cookies for dashboard and platform-admin.
- Organisations and memberships are **not** Better Auth's organisation
  plugin. They belong to `packages/tenancy` so tenancy, RLS and
  entitlements stay under our control.

Details: `docs/architecture/04-auth-rbac.md`.

## Consequences

- Stable, actively maintained foundation with an upgrade path to MFA,
  passkeys and SSO.
- The wrapper makes replacement possible (Auth.js v5 once stable, or a
  custom implementation) without touching apps.
- We depend on Better Auth's security track record. Pin versions, watch its
  advisories, and cover our flows with our own tests.

## Alternatives considered

- **Auth.js v5 beta**: violates the "no preview foundations" rule. Revisit
  when stable.
- **Auth.js v4**: legacy API shape for the App Router.
- **Custom session implementation** (Lucia-style): full control, but more
  security-critical code to own. Kept as the fallback plan.
- **Hosted identity (Clerk, Auth0, Cognito)**: faster start, but per-MAU cost
  at scale, vendor lock-in for a core asset, and data-residency questions.
