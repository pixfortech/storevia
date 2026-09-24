# Storevia

Storevia is a multi-tenant SaaS platform for building websites and running
online stores. Merchants subscribe to a plan, create one or more stores, design
pages visually, manage products and orders, connect domains and invite staff.

> **Status: Milestone 1 (platform foundation).** Merchants can sign up,
> verify their email, create an organisation (as OWNER), create stores, invite
> their team with roles, and work in a responsive dashboard. Every tenant
> boundary is covered by database, service and end-to-end security tests that
> run in CI. Milestone 0 (architecture) is the approved baseline.

## Documentation

Start with the [documentation index](docs/README.md).

| Topic                       | Document                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| System architecture         | [docs/architecture/01-system-architecture.md](docs/architecture/01-system-architecture.md) |
| Monorepo structure          | [docs/architecture/02-monorepo.md](docs/architecture/02-monorepo.md)                       |
| Tenancy and isolation       | [docs/architecture/03-tenancy.md](docs/architecture/03-tenancy.md)                         |
| Database ERD                | [docs/database/erd.md](docs/database/erd.md)                                               |
| Threat model                | [docs/security/threat-model.md](docs/security/threat-model.md)                             |
| Roadmap                     | [docs/roadmap/implementation-roadmap.md](docs/roadmap/implementation-roadmap.md)           |
| Decisions                   | [docs/adr/](docs/adr/README.md)                                                            |
| Testing and security suites | [docs/architecture/11-testing.md](docs/architecture/11-testing.md)                         |
| Toolchain and updates       | [docs/engineering/toolchain-policy.md](docs/engineering/toolchain-policy.md)               |

## Product surfaces

| Surface                                | Host (production)                       | App                   | Status                      |
| -------------------------------------- | --------------------------------------- | --------------------- | --------------------------- |
| Merchant dashboard (+ Admin API later) | `app.storevia.com`, `api.storevia.com`  | `apps/dashboard`      | **M1**                      |
| Marketing site                         | `storevia.com`                          | `apps/marketing`      | M2                          |
| Platform administration                | `admin.storevia.com`                    | `apps/platform-admin` | M2 (auth realm ready in M1) |
| Background jobs                        | none                                    | `apps/worker`         | M2                          |
| Storefronts                            | `{store}.storevia.site`, custom domains | `apps/storefront`     | M4                          |

## Requirements

- **Node.js 24 or newer.** The recommended version is the latest release of the
  LTS line in `.nvmrc`, which is what CI requires and production runs. CI also
  tests the newest Node Current release as a canary. Run `pnpm toolchain:check`
  to see where your runtime stands
  ([toolchain policy](docs/engineering/toolchain-policy.md)).
- **pnpm** at the exact version in `package.json` → `packageManager`.
  `corepack enable` provides it. Node 25+ doesn't bundle corepack, so run
  `npm install -g corepack` first. Any pnpm ≥ 10 also switches to the pinned
  version on its own.
- PostgreSQL 16+ (production and required CI use 17; the canary tests the
  newest major) and a superuser connection for local setup.
- macOS, Linux or Windows. CI runs the non-browser suites on Windows too.

## Getting started

```sh
corepack enable              # Node 25+: npm install -g corepack first
pnpm toolchain:check         # runtime and tool versions against the policy
pnpm install                 # also generates the Prisma client
cp .env.example .env         # then set AUTH_SECRET (openssl rand -base64 32) and DATABASE_ADMIN_URL
pnpm db:setup                # create database roles + dev and test databases
pnpm db:reset                # migrate the dev database from zero
pnpm db:seed:dev             # optional demo tenants (password: storevia-dev-password)
pnpm --filter @storevia/dashboard dev        # http://app.localhost:3001
pnpm --filter @storevia/platform-admin dev   # http://admin.localhost:3003 (staff)
pnpm --filter @storevia/worker dev           # background jobs (expiry, usage reconciliation)
```

`pnpm db:reset` also loads the plan catalogue (`pnpm db:seed`). No real
payment gateway is integrated yet (ADR-0022): plans are assigned by staff in
platform-admin, and a signed mock billing provider can be exercised there
outside production (`MOCK_BILLING_WEBHOOK_SECRET` must be set).

For local email, set `EMAIL_TRANSPORT=file` (and `EMAIL_FILE_DIR`): verification
and invitation emails are written as JSON files. Otherwise set `SMTP_URL`
(e.g. Mailpit). Set `AUTH_BREACHED_PASSWORD_CHECK=off` when working offline.

Seeded accounts: `owner@acme.test` (Business plan, two stores),
`designer@acme.test` (Designer role), `owner@globex.test` (a separate tenant
on a Starter trial) and `staff@storevia.test` (platform staff; signs in to
platform-admin).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## Scripts

| Script                                                | Description                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                                            | Run all apps in development mode                                                  |
| `pnpm build`                                          | Production build of every app                                                     |
| `pnpm lint`                                           | ESLint across the repository                                                      |
| `pnpm typecheck`                                      | TypeScript checks in every package                                                |
| `pnpm test`                                           | Unit tests                                                                        |
| `pnpm test:integration`                               | Integration tests (PostgreSQL)                                                    |
| `pnpm test:e2e`                                       | Playwright end-to-end tests                                                       |
| `pnpm format` / `pnpm format:check`                   | Prettier write / verify                                                           |
| `pnpm db:setup` / `pnpm db:reset` / `pnpm db:migrate` | Create roles and databases / recreate + migrate dev DB / apply pending migrations |
| `pnpm db:test:prepare`                                | Recreate and migrate the `*_test` database                                        |
| `pnpm db:seed`                                        | Idempotent reference data: the plan catalogue                                     |
| `pnpm db:seed:dev`                                    | Idempotent demo data (never in production)                                        |
| `pnpm --filter @storevia/billing billing:sweep`       | Run the subscription expiry sweep once (the worker runs it every 5 minutes)       |
| `pnpm db:validate:draft`                              | Validate the draft ERD schema                                                     |
| `pnpm check:schema`                                   | Live schema agrees with the ERD draft (ADR-0020)                                  |
| `pnpm verify`                                         | Everything CI runs, locally                                                       |

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Licence

Proprietary. All rights reserved.
