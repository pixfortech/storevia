# ADR-0019: Dependency and toolchain policy

- Status: Accepted (amended by [ADR-0026](0026-evergreen-toolchain-and-controlled-updates.md))
- Date: 2026-09-24

## Decision

- Pin exact versions for production dependencies; commit the lockfile;
  install with `--frozen-lockfile` in CI.
- Foundations use **stable releases only**: no alpha/beta/RC, and new
  majors are adopted after their first patch releases.
- Current pins (2026-09, M0 snapshot; ADR-0026 replaces the runtime rule
  and makes these a starting point, not a ceiling): Node 22 LTS, pnpm 10.33, TypeScript **6.0.x**
  (`typescript-eslint` supports `<6.1`; TypeScript 7 is adopted when the lint
  and framework tooling support it), Next.js 16.3.x, Prisma 7.10.x (not the
  8.0 RC on the `latest` tag), Better Auth 1.7.x, zod 4.x, Tailwind 4.x,
  Vitest 4.1.x (5.0 was released days ago), Playwright 1.63.x, ESLint 10.x.
- Automated update PRs (Renovate/Dependabot) grouped weekly; security
  updates immediately. Each PR runs the full CI.
- New dependencies need a reason in the PR description (size, maintenance,
  licence, security history). Prefer platform APIs and small libraries.
- Licences: permissive (MIT/BSD/Apache-2.0/ISC) by default. Copyleft
  licences need review.

## Consequences

- Predictable builds, and a deliberate path to adopt new majors.
