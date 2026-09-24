# ADR-0026: Evergreen toolchain and controlled updates

- Status: Accepted
- Date: 2026-09-24
- Amends: ADR-0019 (dependency and toolchain policy)

## Context

ADR-0019 pinned Node to `>=22.12.0 <23` and recorded the M0 dependency
versions. A capped runtime range goes stale by design. It refused Node 24
(now the Active LTS line) and would refuse every later release until someone
edited the metadata. Developers with a current runtime were told to
downgrade, and nothing proved whether newer runtimes actually worked.
Storevia is a commercial platform that has to stay on supported software
continuously, without giving up reproducible builds.

## Decision

1. **Runtime roles.**
   - The minimum supported Node is a floor with no ceiling (`engines.node`,
     `>=24` today).
   - The required, production LTS line is `.nvmrc` (a major, `24`). CI tests
     its latest patch.
   - A canary runs on the newest Node Current release and the newest
     PostgreSQL major. It reports early and never blocks a merge.

   Installing is allowed by `engines`; **support is what CI proves.**

2. **One matrix.** `.github/runtime-matrix.json` (with `.nvmrc`) defines what
   CI runs. Workflows read it instead of repeating version numbers. The
   integration and E2E jobs run on both entries. A Windows job runs install,
   the non-browser suites, the database scripts and the builds on the LTS
   line.
3. **Reproducibility is unchanged.** Exact versions, the committed lockfile,
   `--frozen-lockfile` and an exact `packageManager` pnpm. No `latest` or
   `*` specifiers. Newer versions enter only through tested pull requests.
4. **Automation.**
   - Dependabot proposes npm and GitHub Actions updates weekly: grouped,
     with a cooldown, majors separate.
   - A toolchain watch workflow covers what Dependabot can't: pnpm
     (`packageManager`) PRs within a major, Node LTS promotion PRs
     (`.nvmrc`), and issues for pnpm majors and gitleaks releases.
   - CI also runs weekly, so the canary sees new releases without a push.
5. **Merge policy** (`.github/dependency-policy.json`, applied only after
   every required job passed, loaded from the base branch):
   - Patches merge automatically unless high-risk.
   - Minors merge automatically only for low-risk development dependencies.
   - Majors, high-risk packages (Next.js, React, Prisma, Better Auth, argon2,
     `pg`, nodemailer, zod), core-framework minors, action updates and
     maintainer changes always go to review.
6. **PostgreSQL.** Production stays on its major until a planned operations
   upgrade (rehearsal, backup and restore, extensions, rollback). The canary
   tests the newest major continuously.
7. **Portability.** Package scripts must run in any shell, including
   Windows `cmd`: no inline `VAR=value`, no single-quoted arguments, and no
   spawning `.cmd` shims without a shell.

The operating procedure, update classes and pinned items are in
[docs/engineering/toolchain-policy.md](../engineering/toolchain-policy.md).

## Consequences

- Node 24 developers (including 24.16) and Node 26 developers can work
  without changing runtimes. Node 22 is refused at install with a clear
  engines error.
- ADR-0019's "Current pins (2026-09)" list is a historical snapshot, not a
  ceiling. Its other rules still hold: exact pins, lockfile, stable releases
  only, licence review and justification for new dependencies.
- CI does more work per push (two runtimes plus Windows). The canary legs run
  in parallel and never block.
- Branch protection check names change to the matrix names (see
  CONTRIBUTING.md). An admin must update the required checks.
