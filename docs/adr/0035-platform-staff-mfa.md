# ADR-0035: Platform staff MFA (TOTP)

- Status: Accepted
- Date: 2026-09-28

## Context

Platform-admin can change any merchant's plan, see every tenant's
diagnostics and, from M8, suspend stores. Staff signed in with a password
alone. The roadmap (M8-11) and the architecture (04-auth-rbac §MFA) require
MFA for platform staff before platform-admin reaches production. The
architecture named Better Auth's two-factor plugin. That plugin assumes Better
Auth's HTTP handler and its cookie-based pending-2FA flow, but Storevia calls
Better Auth's API from server actions and doesn't mount the handler.

## Decision

1. **TOTP (RFC 6238)**, implemented in `packages/auth/src/totp.ts`.
   - HMAC-SHA1, 30-second steps, 6 digits. This is what every authenticator
     app supports.
   - One step of drift is accepted either side.
   - The module is pure, so the unit tests (RFC 6238 vectors) and the E2E
     helper use the same code.
2. **Storage: `StaffMfa`**, one row per user, managed by `packages/auth`
   with the system role.
   - The secret is sealed with AES-256-GCM under `STAFF_MFA_KEYS`, which is
     versioned like payment credentials. The associated data binds each
     secret to its user id.
   - `lastUsedStep`: a code, or an older one, is never accepted twice. The
     update is compare-and-set, so two concurrent uses of one code can't
     both pass.
   - Ten single-use recovery codes, shown once and stored as SHA-256
     hashes.
3. **Every staff sign-in needs its second factor.**
   - Signing in with a password creates a session with
     `Session.mfaVerifiedAt = null`.
   - Such a session opens no admin page (`requireStaff` redirects to `/mfa`)
     and runs no admin action (`requireActionStaff` refuses it).
   - `/mfa` shows enrolment the first time (mandatory: the setup key, an
     `otpauth://` link, then the first code) and a code challenge after that.
     A recovery code is accepted in place of a code.
   - A successful check stamps `mfaVerifiedAt` on that session.
4. **Enrolment can't be redone from a session.** Once an authenticator is
   enrolled, a new one can't be set up from inside a session, so a stolen
   session can't swap the device. Resetting a lost authenticator (no
   recovery codes left) is an operations procedure: delete the `StaffMfa`
   row after verifying the person out of band. See
   `docs/operations/launch-checklist.md`.
5. **Limits and audit.**
   - Verification attempts: 10 per user per 15 minutes.
   - Audited: `auth.platform.mfa_enrolled`, `mfa_verified` (with the method
     used) and `mfa_failed`.
6. **Step-up is unchanged.** It stays a password re-confirmation within the
   MFA-verified session.

## Consequences

- Platform-admin now meets the roadmap's bar for production. SSO for staff
  is still open (a launch-checklist item if staff grow beyond a few
  people).
- The session isn't rotated when MFA completes (the architecture asked for
  that). A pre-MFA session grants nothing, and its cookie is `__Host-`,
  HttpOnly and SameSite=Strict, so the risk of keeping it is low. Rotating
  would need the password again.
- Merchant MFA stays deferred (M8 scope). The same module and flow can
  serve it later.
- Operations must set `STAFF_MFA_KEYS` in every deployed environment.
  Rotating that key means adding a new version; older versions keep
  decrypting.

## Alternatives considered

- **Better Auth two-factor plugin.** It is tied to the HTTP handler and its
  cookie flow, which this app doesn't mount, and it needs extra
  plugin-owned tables.
- **SSO only.** No identity provider exists for staff yet. SSO can come on
  top of this.
- **WebAuthn.** It is stronger, but needs client-side ceremony and device
  management UI. TOTP ships now.
