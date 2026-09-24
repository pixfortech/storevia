# @storevia/database

Prisma schema, migrations, database clients and the tenant transaction helper.

## Entry points

| Import                        | Role                                         | Use                                                                                                        |
| ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@storevia/database`          | `storevia_app` (NOBYPASSRLS)                 | `withTenant(scope, fn)`, generated enums, `Prisma` namespace. The only way domain code touches tenant data |
| `@storevia/database/system`   | `storevia_system` (BYPASSRLS, narrow grants) | Allow-listed: `packages/auth`, invitation-token lookup in `packages/tenancy`                               |
| `@storevia/database/platform` | `storevia_platform` (BYPASSRLS, SELECT only) | `apps/platform-admin` read models                                                                          |
| `@storevia/database/testing`  | `storevia_migrator` on `*_test` only         | Fixtures and truncation in tests                                                                           |

## Transaction conventions

- Every tenant read or write runs inside `withTenant({ organisationId, storeId, userId }, tx => …)`.
  The RLS context is set with transaction-local `set_config`, so it's safe with
  transaction-mode pooling.
- `withTenant` scopes are built only by `packages/tenancy` from a verified
  `TenantContext`. Domain code never builds one from request input.
- Queries still filter by `organisationId`/`storeId` explicitly. RLS is the
  safety net, not a replacement.
- Audit rows are written with `createMany` (no `RETURNING`), so roles with
  `INSERT`-only grants can write them.
- Keep transactions short. No network calls (email, providers) inside them.

## Workflow

```sh
pnpm db:setup          # create roles + dev and test databases (needs DATABASE_ADMIN_URL superuser)
pnpm db:reset          # drop + recreate the dev database and apply all migrations
pnpm db:test:prepare   # same for the *_test database used by integration tests
pnpm db:migrate        # apply pending migrations (prisma migrate deploy, migrator role)
pnpm db:migrate:dev    # author a new migration (then add RLS/grants/SQL by hand)
pnpm db:seed           # reference data (none in Milestone 1)
pnpm test:integration  # integration + tenant-isolation tests against *_test
```

## Adding a model

1. Promote it from `docs/database/schema.draft.prisma` (ADR-0020). `pnpm check:schema` must pass.
2. `pnpm db:migrate:dev --create-only`, then append the SQL for RLS (`ENABLE` +
   `FORCE` + policy), grants, immutable-owner trigger, partial indexes and CHECKs.
3. Extend `tests/rls.int.test.ts` (T12/T13 cover new tables automatically once they have `organisationId`).
