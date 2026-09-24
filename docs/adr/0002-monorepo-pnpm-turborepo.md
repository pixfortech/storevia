# ADR-0002: Monorepo with pnpm workspaces and Turborepo

- Status: Proposed
- Date: 2026-09-24

## Context

Storevia has five deployable apps (marketing, dashboard, storefront,
platform-admin, worker) sharing domain logic, validation, database access and a
design system. Business logic must not be duplicated between apps.

## Decision

- One repository, **pnpm workspaces** (`apps/*`, `packages/*`), pnpm version
  pinned via `packageManager`, strict dependency resolution.
- **Turborepo** orchestrates `build`, `lint`, `typecheck`, `test` with caching.
- Internal packages are TypeScript **source packages** compiled by their
  consumers; no per-package build unless required.
- Package boundaries and dependency direction are enforced by lint rules (see
  `docs/architecture/02-monorepo.md`).
- Packages are created only when real code lands in them.

## Consequences

- Atomic changes across apps and packages; one CI pipeline; one lockfile.
- Lint-enforced boundaries are needed to stop the monorepo becoming a ball of
  mud.
- CI time grows with the repo. Turbo caching and affected-only E2E runs
  mitigate this.

## Alternatives considered

- **Polyrepo**: duplicated tooling, versioning friction between tightly
  coupled packages. Rejected.
- **Nx**: more features but heavier; Turborepo is sufficient. Revisit if
  needed.
