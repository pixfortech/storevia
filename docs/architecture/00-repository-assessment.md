# 00 — Repository assessment

> Milestone 0 deliverable. Assessed 2026-09-24.

## Findings

| Item                                   | Finding                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Commits                                | None. The repository `pixfortech/storevia` had no commits, branches or files at the start of Milestone 0. |
| Existing code                          | None, so nothing to preserve, migrate or remove.                                                          |
| Existing CI, secrets, `.env` files     | None.                                                                                                     |
| Conflicts with the target architecture | None in the repository. The specification itself has a few tensions, resolved below.                      |

Because the repository is empty, this assessment covers the **toolchain and
ecosystem** state that affects the architecture, plus the specification
tensions.

## Toolchain snapshot (npm registry, 2026-09-24)

| Package               | Latest tag                                 | Decision                                                          | Reason                                                                                                                                                      |
| --------------------- | ------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next`                | 16.3.x                                     | **Pin 16.3.x**                                                    | Current stable App Router release                                                                                                                           |
| `react`               | 19.x                                       | Pin the version Next 16.3 is tested with                          |                                                                                                                                                             |
| `typescript`          | 7.0.2 (`latest`)                           | **Pin 6.0.x**                                                     | `typescript-eslint` 8.70 supports `typescript <6.1`. TypeScript 7 (the native port) is adopted once the lint and Next.js tooling support it (tracked issue) |
| `prisma`              | `latest` tag points to **8.0.0-rc.15**     | **Pin 7.10.x**                                                    | The spec forbids preview dependencies for foundations; 8.0 is a release candidate                                                                           |
| `next-auth` / Auth.js | v4 stable (Pages-era API), v5 still `beta` | **Not used**: Better Auth 1.7.x (ADR-0007)                        | Auth.js v5 is still a beta and v4 is not built for App Router                                                                                               |
| `better-auth`         | 1.7.5                                      | Pin 1.7.x                                                         | Stable, framework-agnostic, DB sessions, rate limiting, plugins for 2FA/passkeys/SSO                                                                        |
| `tailwindcss`         | 4.3.x                                      | Pin 4.x                                                           |                                                                                                                                                             |
| `vitest`              | 5.0.1 (released days ago)                  | Pin **4.1.x** for M1, evaluate 5.x after its first patch releases | Don't make a days-old major a foundation                                                                                                                    |
| `@playwright/test`    | 1.63.x                                     | Pin; the container ships Chromium                                 |                                                                                                                                                             |
| `zod`                 | 4.x                                        | Pin 4.x                                                           | Central validation (ADR-0017)                                                                                                                               |
| `eslint`              | 10.x                                       | Pin 10.x (flat config)                                            |                                                                                                                                                             |
| `turbo`               | 2.x                                        | Pin                                                               |                                                                                                                                                             |
| `@tiptap/*`           | 3.x                                        | Pin (M5)                                                          |                                                                                                                                                             |
| `@dnd-kit/core`       | 6.x                                        | Pin (M5)                                                          |                                                                                                                                                             |
| `stripe`              | 22.x                                       | Pin (M2)                                                          |                                                                                                                                                             |
| Node.js               | 22 LTS available                           | **Node 22 LTS** (`.nvmrc`), `engines` enforced                    |                                                                                                                                                             |
| pnpm                  | 10.33                                      | `packageManager` field pins it                                    |                                                                                                                                                             |
| PostgreSQL            | 16 locally; managed 17/18 available        | Develop/test on **17**, production 17+                            | UUIDv7 generated in application code, so no dependency on PG18's `uuidv7()`                                                                                 |

## Specification tensions and how they are resolved

| #   | Specification text                                                                                    | Tension                                                                                              | Resolution                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Auth.js or equally appropriate" + "no experimental/preview dependencies"                             | Auth.js v5 is still beta                                                                             | Better Auth, wrapped behind `packages/auth` so it can be replaced (ADR-0007)                                                                                                        |
| 2   | "latest stable Prisma"                                                                                | npm `latest` is an RC                                                                                | Prisma 7.10 (ADR-0004)                                                                                                                                                              |
| 3   | Store field `tenantId`                                                                                | The tenant is the **Organisation**                                                                   | Column is `organisationId` everywhere; "tenant" and "organisation" are synonyms in docs                                                                                             |
| 4   | Store field `defaultDomain`                                                                           | Would duplicate `StoreDomain`                                                                        | Derived: the `PLATFORM_SUBDOMAIN` domain; the canonical host is the `isPrimary` domain                                                                                              |
| 5   | `Category` in §11 but not in §44                                                                      | Overlaps with Collection                                                                             | Global taxonomy reference data, deferred to M3 ([erd.md §4.3](../database/erd.md#43-catalogue))                                                                                     |
| 6   | Package list                                                                                          | No home for tenancy, media or observability; putting them in `auth`/`commerce` would blur boundaries | Adds `packages/tenancy`, `packages/media` and `packages/observability`, plus `packages/jobs` when the worker needs it ([02-monorepo.md](./02-monorepo.md))                          |
| 7   | Fulfilment state includes `CANCELLED`                                                                 | Cancellation is an order-level event                                                                 | `CANCELLED` kept in the enum as specified; `Order.cancelledAt`/`cancelReason` record the cancellation itself                                                                        |
| 8   | "Pages" and "Themes" both define storefront layout                                                    | Who owns the page tree?                                                                              | Pages are store-level documents; themes supply tokens, section presets and default templates (ADR-0012)                                                                             |
| 9   | `/api/v1/` namespace                                                                                  | Host not specified                                                                                   | Admin API at `https://api.storevia.com/api/v1/…`, token-auth only (no cookies), initially served by the dashboard deployment ([10-api-webhooks-apps.md](./10-api-webhooks-apps.md)) |
| 10  | "No large feature development before [M0] is reviewed" and "proceed with scaffolding and Milestone 1" | Order of work                                                                                        | M0 docs and a tooling-only scaffold are delivered first; Milestone 1 feature work starts after review                                                                               |

## Operational notes

- Nothing in the repository is deployed yet, so there is no production data.
- The repository has no default branch yet. The first push creates
  `claude/cool-thompson-c7u8qp`. A `main` branch with branch protection
  (required checks: format, lint, typecheck, test, build) should be created
  before Milestone 1 work merges. See [CONTRIBUTING.md](../../CONTRIBUTING.md).
