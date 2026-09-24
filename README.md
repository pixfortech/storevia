# Storevia

Storevia is a multi-tenant SaaS platform for building websites and running
online stores. Merchants subscribe to a plan, create one or more stores, design
pages visually, manage products and orders, connect domains and invite staff.

> **Status: Milestone 0 complete (tag `milestone-0`).** The architecture,
> database design, security model and roadmap are the approved baseline.
> Milestone 1 (platform foundation) is in progress.

## Documentation

Start with the [documentation index](docs/README.md).

| Topic                 | Document                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| System architecture   | [docs/architecture/01-system-architecture.md](docs/architecture/01-system-architecture.md) |
| Monorepo structure    | [docs/architecture/02-monorepo.md](docs/architecture/02-monorepo.md)                       |
| Tenancy and isolation | [docs/architecture/03-tenancy.md](docs/architecture/03-tenancy.md)                         |
| Database ERD          | [docs/database/erd.md](docs/database/erd.md)                                               |
| Threat model          | [docs/security/threat-model.md](docs/security/threat-model.md)                             |
| Roadmap               | [docs/roadmap/implementation-roadmap.md](docs/roadmap/implementation-roadmap.md)           |
| Decisions             | [docs/adr/](docs/adr/README.md)                                                            |

## Product surfaces

| Surface                        | Host (production)                       | App (from Milestone 1) |
| ------------------------------ | --------------------------------------- | ---------------------- |
| Marketing site                 | `storevia.com`                          | `apps/marketing`       |
| Merchant dashboard + Admin API | `app.storevia.com`, `api.storevia.com`  | `apps/dashboard`       |
| Storefronts                    | `{store}.storevia.site`, custom domains | `apps/storefront`      |
| Platform administration        | `admin.storevia.com`                    | `apps/platform-admin`  |
| Background jobs                | none                                    | `apps/worker`          |

## Requirements

- Node.js 22 LTS (`.nvmrc`)
- pnpm 10.33 (`corepack enable` picks up the pinned version)
- Docker (for PostgreSQL, Mailpit and MinIO from Milestone 1)

## Getting started

```sh
corepack enable
pnpm install
pnpm verify        # format check, lint, typecheck, tests, build, draft schema validation
```

Local application setup (`docker compose up`, migrations, seeds) arrives with
Milestone 1. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Scripts

| Script                              | Description                        |
| ----------------------------------- | ---------------------------------- |
| `pnpm dev`                          | Run all apps in development mode   |
| `pnpm build`                        | Production build of every app      |
| `pnpm lint`                         | ESLint across the repository       |
| `pnpm typecheck`                    | TypeScript checks in every package |
| `pnpm test`                         | Unit tests                         |
| `pnpm test:integration`             | Integration tests (PostgreSQL)     |
| `pnpm test:e2e`                     | Playwright end-to-end tests        |
| `pnpm format` / `pnpm format:check` | Prettier write / verify            |
| `pnpm db:validate:draft`            | Validate the draft ERD schema      |
| `pnpm verify`                       | Everything CI runs, locally        |

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Licence

Proprietary. All rights reserved.
