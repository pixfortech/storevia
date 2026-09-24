# Contributing to Storevia

## Principles

Priority order for every decision: **security → tenant isolation → data
integrity → correctness → extensibility → performance → user experience →
visual polish.** When a shortcut would compromise an earlier item, stop and
raise it (in the PR or an ADR) instead of taking it.

Read before your first change:

1. [System architecture](docs/architecture/01-system-architecture.md)
2. [Tenancy strategy](docs/architecture/03-tenancy.md): cross-tenant access is a critical defect
3. [Monorepo rules](docs/architecture/02-monorepo.md): package boundaries
4. [Threat model](docs/security/threat-model.md)

## Workflow

1. Pick or open an issue with **acceptance criteria**.
2. Branch from `main`: `feat/<area>-<short-name>`, `fix/…`, `chore/…`, `docs/…`.
3. Implement the **smallest complete vertical slice**: schema + migration,
   server logic, authorisation, entitlements, validation, UI states, tests,
   docs.
4. Run `pnpm verify` locally.
5. Open a PR using the template. Link the issue and any ADRs.
6. CI must be green, and required reviewers (CODEOWNERS for security-sensitive
   packages) must approve. PRs are squash-merged.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):
`feat(tenancy): add invitation acceptance`, `fix(auth): …`, `docs(adr): …`,
`chore(ci): …`. Keep commits coherent: one logical change each.

## Code rules (summary)

- TypeScript strict; no `any`; no non-null assertions to silence the compiler.
- Business logic lives in `packages/*` domain packages as plain functions, not
  in React components or route handlers.
- Every protected operation: `TenantContext` from the server → `authorize` →
  entitlement check → validated input → domain service. Never trust IDs,
  prices, roles or plan state sent by the browser.
- Only `packages/database` touches the Prisma client; tenant data goes through
  `withTenant`.
- All external input is validated with the shared zod schemas.
- Money is integer minor units + currency. Never floats.
- No raw HTML as stored content; no `eval`/`new Function`; no
  `$queryRawUnsafe`.
- Never log secrets, tokens, passwords or payment data.
- Don't add a dependency without explaining why in the PR (size, maintenance,
  licence, security history).

## Database changes

- Always through a migration (`prisma migrate dev`, then add the SQL for RLS,
  partial indexes, CHECKs and triggers).
- Backwards-compatible: expand → migrate → contract. See
  [data-lifecycle.md](docs/database/data-lifecycle.md).
- New tenant tables need `organisationId` (+ `storeId`), composite FKs, RLS
  policy and isolation tests.

## Architecture decisions

Significant decisions (tenancy, security, data formats, public contracts,
core dependencies, infrastructure) need an ADR in `docs/adr/` using the
[template](docs/adr/template.md).

## Secrets

Never commit `.env` files, keys, credentials or tokens. Use `.env.example`
for documentation. CI runs a secret scan on full history. If you commit a
secret by accident, treat it as leaked: rotate it first, then clean up.

## Branch protection (to be configured on `main`)

Required checks: `Format, lint, typecheck, test, build`,
`Integration and tenant-isolation tests`, `End-to-end security tests
(Playwright)` and `Secret scan`. The tenant-isolation and security suites
must never be skipped or weakened to get a PR green
([11-testing.md](docs/architecture/11-testing.md)).
Required review: at least one approval, plus CODEOWNERS where applicable.
No force-pushes; linear history.
