# 02 — Monorepo structure

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**. ADR-0002.

## 1. Tooling

- **pnpm workspaces** (strict, no hoisting of undeclared dependencies) with the
  version pinned in `packageManager`.
- **Turborepo** for task orchestration and caching (`build`, `lint`,
  `typecheck`, `test`, `test:integration`, `test:e2e`).
- **TypeScript 6.0.x**, `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- **ESLint 10 flat config** with `typescript-eslint` (type-aware rules),
  import-boundary rules, and `no-restricted-imports` for security-sensitive
  modules. **Prettier** for formatting.
- Internal packages are **source packages**: they export TypeScript directly
  (`"exports": { ".": "./src/index.ts" }`) and are compiled by the consuming
  app (Next.js `transpilePackages`) or by Vitest. There is no per-package build
  step unless a package is published or run by plain Node (the worker bundles
  with `tsup`).

## 2. Layout

```text
apps/
  marketing/         storevia.com: public site, pricing (reads plans), signup entry
  dashboard/         app.storevia.com: merchant UI + server actions + /api/v1 handlers
  storefront/        *.storevia.site + custom domains: multi-tenant renderer, cart, checkout
  platform-admin/    admin.storevia.com: Storevia staff tooling
  worker/            background jobs (queue consumer, schedulers)
packages/
  config/            shared tsconfig / eslint / tailwind presets
  types/             cross-cutting primitives: branded IDs, TypeID codec, Result, error codes
  validation/        zod schemas shared by server and client (inputs, API contracts, env)
  database/          Prisma schema + migrations + seeds, client factory, withTenant(), RLS helpers
  security/          token generation/hashing, envelope encryption, rate limiter, HTML sanitiser, CSP builder, SSRF-safe fetch
  observability/     logger, request context, tracing, error reporting interface
  auth/              authentication: Better Auth config, sessions, realms, password policy, step-up
  tenancy/           organisations, memberships, invitations, RBAC, stores, TenantContext, authorize()
  entitlements/      features, plan resolution, limits, usage counters: hasFeature/assertFeature/...
  billing/           BillingProvider interface, Stripe provider, subscription lifecycle, webhook handling
  commerce/          catalogue, inventory, customers, cart, pricing, discounts, shipping, tax, checkout, orders
  payments/          PaymentProvider interface + provider implementations (merchant payments)
  site-engine/       generic public sites: request pipeline, signed context, access state, cache and invalidation, SEO, branded shell, content and media reads (ADR-0029)
  editor/            page-document schema + operations, component registry, renderers, editor UI
  themes/            theme manifest schema, package validation, token resolution
  domains/           hostname normalisation, slug rules/reserved slugs, DNS verification, DomainProvisioner
  media/             storage interface (S3), signed uploads, content sniffing, renditions
  email/             EmailSender interface + transactional templates
  analytics/         event schema + ingestion interface (later)
  jobs/              queue abstraction + job definitions shared by apps and worker (introduced with the worker, M2)
  ui/                Storevia design system (accessible React components, tokens)
docs/
  architecture/  adr/  api/  database/  security/  deployment/  roadmap/
```

### Additions to the specification's list, and why

| Package         | Why it is a real bounded context                                                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenancy`       | Organisations, memberships, invitations, roles and store lifecycle make up the tenant model. Putting it in `auth` would mix "who you are" with "what you may touch"; putting it in `commerce` would make every app depend on commerce. |
| `media`         | Storage abstraction, signed uploads, MIME sniffing and renditions are used by catalogue, builder, themes and branding.                                                                                                                 |
| `observability` | Logging, tracing and error reporting are used by every app and the worker, and must redact secrets consistently.                                                                                                                       |
| `jobs`          | Job payload schemas and enqueue helpers are shared by producers (apps) and the consumer (worker). Created when the worker is.                                                                                                          |

## 3. Package introduction schedule

A package is created **only when its first real code lands**. Empty packages
are not scaffolded.

Milestone 1 status: the shared TypeScript and ESLint configuration lives at the
repository root (`tsconfig.base.json`, `eslint.config.mjs`) until a second app
needs presets, so `config` has not been created. `observability` moves to M2
with the worker, which is its first real consumer. In M1, server actions log
unexpected errors as structured JSON with the request ID (`apps/dashboard/src/lib/action.ts`).

| Package                                                                          | Milestone                              | Depends on                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `types`, `validation`, `database`, `security`, `email`                           | M1 ✔                                   | foundation only                                                                 |
| `auth`, `tenancy`, `ui`                                                          | M1 ✔                                   | foundation                                                                      |
| `observability`, `entitlements`, `billing`, app `platform-admin`                 | M2 ✔                                   | foundation, tenancy                                                             |
| `jobs`, app `worker` (periodic scheduler, ADR-0023)                              | M2.5 ✔                                 | foundation (`worker` composes billing, entitlements)                            |
| app `marketing` (public site, catalogue-driven pricing, ADR-0025)                | M2.5 ✔                                 | ui, entitlements (catalogue/format), tenancy (client-safe data)                 |
| `config`                                                                         | when a second app needs shared presets | —                                                                               |
| `commerce` (catalogue + inventory), `media`                                      | M3                                     | foundation, tenancy, entitlements                                               |
| `editor` (document schema, registry, base renderers: `/document`, `/components`) | M4                                     | foundation, validation                                                          |
| `site-engine`, `domains` (ADR-0029: the Site Engine; commerce composes into it)  | M4                                     | foundation, `media/urls` (never commerce, editor, billing or merchant services) |
| `editor` (editor UI `/ui`, full component set)                                   | M5                                     | foundation, validation, ui                                                      |
| `payments`, `commerce` (checkout/orders)                                         | M6                                     | foundation, commerce                                                            |
| `themes`                                                                         | M7                                     | foundation, editor                                                              |
| `analytics`                                                                      | later                                  | foundation                                                                      |

## 4. Dependency rules

```text
apps ──► domain packages ──► foundation packages
  │                                 ▲
  └────────► ui ────────────────────┘ (ui depends only on types/validation/config)
```

Enforced by lint (`eslint-plugin-boundaries` or equivalent) and a CI check:

1. Packages never import from `apps/*`.
2. Foundation packages (`types`, `validation`, `database`, `security`,
   `observability`, `config`) never import domain packages.
3. `ui` never imports `database`, `auth`, `tenancy` or any server-only package.
4. **Only `packages/database` imports `@prisma/client`/the generated client.**
   Domain packages obtain a transaction-scoped, tenant-scoped client through
   `withTenant(ctx, fn)`. The unscoped client is exported from a separate
   entry point (`@storevia/database/system`, `storevia_system` role) whose
   importers are allow-listed: `packages/auth` (identity tables), the
   rate limiter in `packages/security`, the invitation-token lookup in
   `packages/tenancy`, and later the storefront hostname resolver (M4), merchant payment webhooks
   (M6) and the worker's tenant-iterating schedulers. Platform-admin uses its
   own entry point (`@storevia/database/platform`: reads plus the specific
   audited writes its staff actions need), shared only with `packages/billing`
   and the platform-staff resolver in `packages/tenancy`. The billing role
   (`@storevia/database/billing`: webhook ledger, mock provider, expiry sweep)
   is imported only by `packages/billing`, which may not import the system
   entry point. The worker role (`@storevia/database/worker`) is imported
   only by `packages/jobs` and `apps/worker`. The marketing role
   (`@storevia/database/marketing`: the plan catalogue and its own rate-limit
   rows, ADR-0025) is imported only by `apps/marketing`, which in turn may
   import no other role and no server service package. ESLint
   (`no-restricted-imports`) enforces both allow-lists. Migrations and reference seeds use
   the migrator connection through the Prisma CLI and seed scripts.
5. Domain packages do not import each other in cycles. Cross-domain calls go
   through the public `index.ts` of the other package; when two domains need
   each other, the shared piece moves down a layer or communicates through
   outbox events.
6. `storefront` may import only the read-side entry points of domain packages
   (`@storevia/commerce/storefront`, `@storevia/site-engine/*`,
   `@storevia/editor/document`, `/registry`, `/render`), never
   administrative mutations.
7. The Site Engine (`@storevia/site-engine`, `@storevia/domains`) never
   imports commerce, the editor, billing, entitlements, tenancy, auth or an
   app; commerce depends on it, not the reverse (ADR-0029, enforced by
   ESLint and an import-graph test).

## 5. Conventions

- Package names: `@storevia/<folder>`.
- Public API per package is its `src/index.ts` (plus explicit sub-path
  exports such as `/server`, `/client`, `/storefront`). Deep imports are lint
  errors.
- Tests live beside code: `*.test.ts` (unit), `*.int.test.ts` (integration,
  needs PostgreSQL), `apps/*/e2e/*.spec.ts` (Playwright).
- Environment variables are declared and validated per app with a zod schema
  (`src/env.ts`); the app fails fast at start-up if one is missing. Only
  variables prefixed `NEXT_PUBLIC_` can reach the browser, and the schema marks
  which ones are public.
- Every package has a short `README.md` with its responsibility and public API.
- `CODEOWNERS` maps `packages/database`, `packages/auth`, `packages/tenancy`,
  `packages/security`, `packages/billing` and `packages/payments` to required
  reviewers.

## 6. Root scripts

| Script                              | Does                                          |
| ----------------------------------- | --------------------------------------------- |
| `pnpm dev`                          | Runs all apps in dev mode (Turbo)             |
| `pnpm build`                        | Production build of every app                 |
| `pnpm lint` / `pnpm typecheck`      | ESLint / `tsc --noEmit` everywhere            |
| `pnpm test`                         | Unit tests                                    |
| `pnpm test:integration`             | Integration tests against PostgreSQL          |
| `pnpm test:e2e`                     | Playwright end-to-end tests                   |
| `pnpm format` / `pnpm format:check` | Prettier write / verify                       |
| `pnpm db:validate:draft`            | Validates `docs/database/schema.draft.prisma` |
