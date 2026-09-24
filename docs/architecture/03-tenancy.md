# 03 — Tenancy strategy

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**. ADR-0005.
>
> Cross-tenant access is a **critical security defect**. This document defines
> how isolation is achieved and how it is proven.

## 1. Model

```text
User ──< Membership >── Organisation (tenant) ──< Store ──< store resources
```

- **Shared database, shared schema, tenant columns.** Every tenant-owned row
  carries `organisationId`; every store-owned row also carries `storeId`
  ([erd.md §1](../database/erd.md#1-scope-classes)).
- A user may belong to many organisations; an organisation may own several
  stores (limited by the `store_count` entitlement).

### Alternatives considered

| Option                                   | Isolation                   | Cost at thousands of tenants                                                                                            | Verdict                                                                                                                                                            |
| ---------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database per tenant                      | Strongest                   | Thousands of databases and migrations to run; connection pooling is hard; cross-tenant ops (billing, admin) are painful | Rejected for the default tier. May be offered later as an enterprise "dedicated" deployment, which the design allows because all data is keyed by `organisationId` |
| Schema per tenant                        | Strong                      | Same migration and catalogue-bloat problems; Prisma support is poor                                                     | Rejected                                                                                                                                                           |
| **Shared schema + tenant columns + RLS** | Strong when layered (below) | One schema, one migration path, simple pooling                                                                          | **Chosen**                                                                                                                                                         |

## 2. Defence in depth: four layers

| Layer                             | Mechanism                                                                                                                                         | What it catches                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Context resolution             | `TenantContext` built only by the server from the session/API key + membership lookup; never from a client-supplied tenant ID alone               | Forged IDs, stale access                                                       |
| 2. Authorisation                  | `authorize(ctx, permission)` + `assertFeature(ctx, feature)` before every action                                                                  | Privilege escalation, plan bypass                                              |
| 3. Scoped data access             | Repositories always add `organisationId`/`storeId` predicates from the context; the Prisma client is only reachable through `withTenant(ctx, fn)` | Forgotten `WHERE` clauses (IDOR)                                               |
| 4. PostgreSQL RLS + composite FKs | Policies filter every tenant table on the transaction's context; composite FKs make cross-store links unrepresentable                             | Bugs in layers 1–3, raw SQL mistakes, future code that bypasses the repository |

Layers 1–3 are the primary control; layer 4 is the safety net. A test suite
proves each layer independently (§8).

## 3. The authorisation pipeline

Every protected operation runs these checks in order. Each is server-side.

1. **Authenticated**: a valid session (dashboard realm) or API credential.
   Otherwise `401`.
2. **Active membership**: `Membership(userId, organisationId)` exists with
   `status = ACTIVE`, the organisation is not `SUSPENDED`/`DELETED`, and the
   user is not `DISABLED`. Membership is **looked up per request**, not cached
   in the session, so removal takes effect immediately.
3. **Permission**: the membership's role grants the permission
   ([04-auth-rbac.md](./04-auth-rbac.md)). Otherwise `403`.
4. **Tenant**: the requested organisation is the membership's organisation
   (the IDs come from the URL, but they're only trusted after step 2 matches
   them).
5. **Store**: the store belongs to that organisation, and the membership
   either has `allStores` or an explicit `MembershipStoreAccess` row.
6. **Entitlement**: when the action is plan-gated, `assertFeature` /
   `canConsume` passes ([05-billing-entitlements.md](./05-billing-entitlements.md)).
   Otherwise a typed `ENTITLEMENT_REQUIRED` / `LIMIT_REACHED` error.

**Non-disclosure rule:** when steps 2, 4 or 5 fail, the response is **404 Not
Found**, the same as for a non-existent resource. A user must not be able to
learn whether another tenant's store, product or order ID exists. Step 3
failures on a resource the user _can_ see return 403.

## 4. `TenantContext`

```ts
// packages/tenancy/src/context.ts (sketch)
declare const tenantContextBrand: unique symbol;

export type Actor =
  | { kind: "member"; userId: UserId; membershipId: MembershipId; role: MemberRole }
  | { kind: "api_key"; apiKeyId: ApiKeyId; scopes: ReadonlySet<ApiScope> }
  | { kind: "system"; job: string }; // worker jobs, always tied to one tenant

export interface TenantContext {
  readonly [tenantContextBrand]: true; // cannot be constructed outside packages/tenancy
  readonly actor: Actor;
  readonly organisationId: OrganisationId;
  readonly storeId: StoreId | null; // null for organisation-level operations
  readonly permissions: ReadonlySet<Permission>;
  readonly requestId: string;
}
```

Constructors, the only ways to obtain a context:

| Constructor                                           | Used by                                      | Resolves from                                                                       |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `resolveOrganisationContext(session, organisationId)` | dashboard org-level pages (billing, members) | session user + membership                                                           |
| `resolveStoreContext(session, storeId)`               | dashboard store pages                        | session user + membership + store + store access                                    |
| `resolveApiContext(apiKey)`                           | `/api/v1`                                    | hashed key lookup; the key is bound to one store; scopes → permissions              |
| `resolveStorefrontContext(hostname)`                  | storefront                                   | hostname → `StoreDomain` → store (read-only public actor)                           |
| `systemContext(job)`                                  | worker                                       | the job's `organisationId`/`storeId`, which the server set when it enqueued the job |

Dashboard URLs carry public IDs (`/stores/{storeTypeId}/products`), so multiple
tabs for different stores work at once. The ID in the URL is a **request**, and
the constructor decides whether the user may have it.

## 5. Data access

### 5.1 `withTenant`

```ts
// packages/database/src/tenant.ts (sketch)
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.organisation_id', ${ctx.organisationId}, true),
      set_config('app.store_id',        ${ctx.storeId ?? ""}, true),
      set_config('app.user_id',         ${actorUserId(ctx) ?? ""}, true)`;
    return fn(tx as TenantDb);
  });
}
```

- `set_config(…, true)` is **transaction-local**, so it is safe with
  transaction-mode connection pooling (PgBouncer / RDS Proxy): the setting can
  never leak to the next request that reuses the connection.
- Repositories still add explicit `where: { storeId: ctx.storeId, … }`.
  RLS isn't a replacement for writing correct queries. It means a wrong query
  returns nothing instead of another tenant's data.
- Lookups by ID use `findFirst({ where: { id, storeId } })`, never
  `findUnique({ where: { id } })` alone. A lint rule flags `findUnique`/
  `update`/`delete` on tenant models without a tenant predicate.

### 5.2 RLS policies

Applied in the migration that creates each tenant table:

```sql
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;   -- applies to the table owner too

CREATE POLICY tenant_isolation ON "Product"
  USING (
    "organisationId" = NULLIF(current_setting('app.organisation_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.store_id', true), '') IS NULL
      OR "storeId" = NULLIF(current_setting('app.store_id', true), '')::uuid
    )
  )
  WITH CHECK (
    "organisationId" = NULLIF(current_setting('app.organisation_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.store_id', true), '') IS NULL
      OR "storeId" = NULLIF(current_setting('app.store_id', true), '')::uuid
    )
  );
```

- `NULLIF(…, '')` matters: after a transaction-local setting ends, Postgres
  reports `''` rather than NULL, and `''::uuid` would raise. With no context
  set, the comparison is `NULL` and **no rows are visible** (fail closed).
- The context resolver must list "my organisations/stores" before an
  organisation is selected. Three extra **`FOR SELECT`** policies allow it.
  Writes still require the strict tenant policy.
  - `Membership`: `"userId" = app.user_id`. A user sees their own
    memberships. This clause doesn't query `Membership`, so it cannot
    recurse (a policy on `Membership` that queried `Membership` would fail
    with "infinite recursion detected in policy").
  - `Organisation` and `Store`: the row's organisation is in
    `app_member_organisation_ids()`. This is a `STABLE SECURITY DEFINER` SQL
    function returning the `organisationId`s of the current user's `ACTIVE`
    memberships. It runs as the table owner (which has `BYPASSRLS`), so it
    doesn't re-enter the policies.
  - `User` (merchant identity): the app role has column-level `SELECT` on
    non-secret columns only (`id`, `name`, `email`, `image`, `locale`,
    `timezone`). Rows are visible when they are the current user, or share
    a membership with `app.organisation_id` (member lists).
- A generated SQL test asserts that **every** table with an
  `organisationId` column has RLS enabled, forced, and a policy. A new
  tenant table without a policy fails CI.

### 5.3 Database roles

| Role                      | Used by                                                       | RLS                       | Privileges                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storevia_migrator`       | Migrations and reference seeds (CI/CD job, `pnpm db:migrate`) | `BYPASSRLS` (table owner) | Owns the schema; DDL. Owns the few `SECURITY DEFINER` helper functions                                                                                                                                                                                                                             |
| `storevia_app`            | dashboard, storefront, worker tenant jobs                     | **`NOBYPASSRLS`**         | DML on tenant tables; column-level `SELECT` on `User`; **no** access to `Account`, `Session`, `Verification`; `UPDATE`/`DELETE` revoked on append-only tables                                                                                                                                      |
| `storevia_system`         | the allow-listed `@storevia/database/system` entry point only | `BYPASSRLS`               | **Narrow `GRANT`s**, added per use case: identity tables (auth), invitation lookup by token hash (tenancy), later hostname resolution (M4), inbound webhook ledgers (M2/M6) and tenant-iterating schedulers. Because the role bypasses RLS, its grants and queries are reviewed like security code |
| `storevia_platform`       | platform-admin                                                | `BYPASSRLS`               | `SELECT` grants only (BYPASSRLS cannot be limited to reads, so read-only access comes from the grants); each audited platform write gets its own specific grant when built                                                                                                                         |
| `storevia_retention` (M8) | worker purge jobs                                             | `BYPASSRLS`               | `DELETE` on expired rows and partitions, including append-only tables                                                                                                                                                                                                                              |

Roles are cluster-level objects. Infrastructure (IaC in production;
`pnpm db:setup`, introduced in Milestone 1, locally and in CI) creates them with credentials. Migrations
only `GRANT` to them and never embed passwords.

Identity tables (`User`, `Account`, `Session`, `Verification`) are not tenant
data. They are written only by `packages/auth` through the system
connection.

## 6. Other isolation surfaces

| Surface              | Rule                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object storage       | Keys are server-generated: `{organisationId}/{storeId}/{mediaId}/…`. Signed upload URLs are issued only after `authorize(ctx, "media.manage")`, are single-object, short-lived (≤ 10 min), and constrained by content-length range and content type. Private objects are served only through signed GET URLs. |
| Caches               | Every cache key and tag starts with `store:{storeId}` or `org:{organisationId}`. Dashboard pages (tenant data behind a session) are never stored in shared caches (`Cache-Control: private, no-store`).                                                                                                       |
| Search               | Every search query is filtered by `storeId` inside the `SearchIndex` implementation, not by callers.                                                                                                                                                                                                          |
| Background jobs      | Payloads carry `organisationId`/`storeId` set by the server at enqueue time, and handlers run under `systemContext`. Job handlers never accept tenant IDs from external input.                                                                                                                                |
| Logs & errors        | Log records include `organisationId`/`storeId` for correlation. Error messages returned to users never include another tenant's identifiers.                                                                                                                                                                  |
| Webhooks (outbound)  | Deliveries are generated from `OutboxEvent` rows of the endpoint's own store (composite FK), so a store can't receive another store's events.                                                                                                                                                                 |
| Rate limits & quotas | Keyed by organisation/store as well as IP, so one tenant can't exhaust shared capacity (noisy neighbour).                                                                                                                                                                                                     |

## 7. Platform administration isolation

- Separate app, host (`admin.storevia.com`), session realm and cookie
  (`__Host-storevia-admin.session`). A dashboard session is **not valid** on the
  admin surface and the reverse.
- Access requires an active `PlatformStaff` row. Merchant roles (even
  `OWNER`) grant nothing on the platform surface.
- Production access sits behind private networking / zero-trust access plus
  MFA (SSO in production).
- Every platform-admin mutation writes an `AuditLog` row with
  `actorType = PLATFORM_STAFF`. There is no silent impersonation. If
  impersonation is added later it must be explicit, time-boxed, visible to
  the merchant, permission-controlled and fully audited.

## 8. Proof: the tenant-isolation test suite (Milestone 1 exit criteria)

Milestone 2 (billing) does not start until all of these pass in CI.

| #   | Test                                                                                                                                                                            | Layer    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| T1  | User A signs up and creates Organisation A; User B creates Organisation B                                                                                                       | flow     |
| T2  | User A cannot read Organisation B (settings, members, invitations): **404**                                                                                                     | 1, 3     |
| T3  | User A cannot read, update or archive Store B by ID: **404**                                                                                                                    | 1, 3     |
| T4  | User A listing organisations/stores sees only their own (no enumeration)                                                                                                        | 1, 3, 4  |
| T5  | User A cannot invite members to, or change roles in, Organisation B                                                                                                             | 1, 2     |
| T6  | Role permissions: each role × each permission matches the matrix (table-driven, generated from the role map)                                                                    | 2        |
| T7  | Role escalation: ADMIN cannot grant OWNER; non-owners cannot transfer ownership; the last OWNER cannot leave or be demoted                                                      | 2        |
| T8  | Store-scoped member (allStores = false) cannot access a non-granted store in the same organisation                                                                              | 1        |
| T9  | Removed or suspended membership loses access on the **next request** (no cached grants)                                                                                         | 1        |
| T10 | Unauthenticated requests to every dashboard action / API route are rejected (401 / redirect). The route list is generated, so new routes are covered automatically              | 1        |
| T11 | Platform admin: a merchant session (even OWNER) is rejected by platform-admin; a non-staff user cannot sign in there; the admin session cookie is not accepted by the dashboard | 1–2 (§7) |
| T12 | RLS: with the `storevia_app` role and context = Org A, `SELECT` on each tenant table returns no Org B rows; `INSERT`/`UPDATE` with Org B IDs fail; with no context, zero rows   | 4        |
| T13 | RLS coverage: every table with `organisationId` has RLS enabled + forced + policy                                                                                               | 4        |
| T14 | Composite FK: inserting a child that references another store's parent fails                                                                                                    | 4        |
| T15 | IDOR sweep: for every registered store-scoped server action, calling it as User A with Store B's resource IDs returns 404 and changes nothing                                   | 1–3      |
| T16 | Tenant IDs in request bodies are ignored or rejected: a body `organisationId`/`storeId` that differs from the resolved context never takes effect                               | 1        |
