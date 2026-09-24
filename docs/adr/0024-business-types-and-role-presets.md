# ADR-0024: Business types and role presets

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0008 (RBAC), ADR-0022 (entitlements)

## Context

Storevia serves different kinds of businesses: online stores, business
websites, publications and portfolios. Each needs a different first
impression: onboarding, navigation emphasis, suggested team roles and
dashboard content. The plan decides what an organisation is **entitled** to.
RBAC decides what a member is **allowed** to do. A third, independent
dimension is needed for what a store **is**, and it must not weaken either
of the other two.

## Decision

### 1. Three independent dimensions

| Dimension                     | Answers                          | Decided by                                         | Enforced by                                               |
| ----------------------------- | -------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| **Plan** (entitlements)       | May this organisation have it?   | Subscription + overrides (ADR-0022)                | `assertFeature` / `consumeUsage` on every server path     |
| **Role** (permissions)        | May this member do it?           | Membership role → permission primitives (ADR-0008) | `requirePermission` on every server path                  |
| **Business type** (this ADR)  | Should we present it, and where? | The store's configuration                          | Nothing: presentation and defaults only                   |

- Business type is **never** an authorisation input. No server check reads
  it. Code like `if (businessType === "PUBLISHING") allow(...)` is
  forbidden. A lint rule bans business-type literals in the packages that
  enforce permissions and entitlements.
- Business type never grants a paid feature, and choosing a type doesn't
  change the plan.

### 2. Where it lives

`Store.businessType` is an enum: `ECOMMERCE`, `BUSINESS`, `PUBLISHING` or
`PORTFOLIO`. It defaults to `ECOMMERCE`, so existing stores keep today's
experience.

It is **store-level**, not organisation-level, because one organisation can
run an online store and a separate publication, each on the same plan. Staff
with `store.update` can change it at any time. A change is audited
(`store.business_type_changed`) and never deletes or hides data. Only
presentation changes.

Only these four types exist. Verticals (restaurant, booking, education, …)
are later modules, and the definitions module is built to take more types.

### 3. What a business type controls

The definitions live in `@storevia/tenancy/business-types` (client-safe data,
no server imports). Each type defines:

- **onboarding copy:** label, one-line promise, what Storevia adapts;
- **store navigation:** which areas appear and in what order. Areas come from
  one catalogue, and each area declares the **permission** needed to see it,
  optionally the **entitlement** that unlocks it, and its availability
  (`available`, or the milestone that delivers it). The navigation resolver
  filters by permission and marks unentitled areas, so the menu can never show
  more than RBAC and the plan allow;
- **role presets:** recommended roles for invitations (see §4);
- **home emphasis:** which getting-started items the store home shows first.

Areas that aren't built yet appear only as honestly labelled "coming" entries
that open an explanation page with no controls.

### 4. Role presets are system roles, not a second authorisation system

Presets are named suggestions that map onto `MemberRole` values, and each
`MemberRole` maps onto the existing permission primitives in `rbac.ts`. Five
system roles are added so the presets can be expressed precisely:

| Role                | Permissions beyond base read                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `INVENTORY_MANAGER` | `inventory.adjust`                                                                                                            |
| `SITE_MANAGER`      | `member.read`, `store.update`, `settings.manage`, `media.manage`, `analytics.read`, `design.edit`, `page.publish`, `theme.publish`, `navigation.manage` |
| `CONTENT_MANAGER`   | `media.manage`, `analytics.read`, `design.edit`, `page.publish`, `navigation.manage`                                          |
| `EDITOR`            | `media.manage`, `design.edit`, `page.publish`                                                                                 |
| `AUTHOR`            | `media.manage`, `design.edit` (can write, can't publish)                                                                      |

Presets per business type (label → role):

- **Online store:** Store Manager → `STORE_MANAGER`; Order Manager →
  `ORDER_MANAGER`; Catalogue Manager → `CATALOGUE_MANAGER`; Inventory
  Manager → `INVENTORY_MANAGER`; Designer → `DESIGNER`; Marketing →
  `MARKETING`; Support → `SUPPORT`.
- **Publication:** Content Manager → `CONTENT_MANAGER`; Editor → `EDITOR`;
  Author → `AUTHOR`; Designer → `DESIGNER`.
- **Business website:** Site Manager → `SITE_MANAGER`; Content Editor →
  `EDITOR`; Designer → `DESIGNER`.
- **Portfolio:** Portfolio Manager → `SITE_MANAGER`; Content Editor →
  `EDITOR`; Designer → `DESIGNER`.

Admin and Viewer are offered for every type. Every existing invariant still
applies to the new roles: the subset rule for assigning, no self-change, one
owner, step-up for ADMIN, and store scope never widening. The role matrix in
[04-auth-rbac.md §7.3](../architecture/04-auth-rbac.md) is the
specification, and a test keeps the code and the documented matrix identical.

Posts, categories and authors don't have their own permission primitives
yet. Until the publishing module exists (a later milestone), content work
maps to `design.edit` (write) and `page.publish` (publish). The publishing
module will add finer primitives through the same matrix.

Custom roles remain future work.

## Consequences

- New business types or verticals are data in one module plus navigation
  areas. Security code doesn't change.
- Presets make invitations clearer without weakening RBAC. A preset can never
  grant more than its mapped role.
- Tests assert that each business type's navigation is permission-filtered,
  that entitlement locks hold for every type, that server checks ignore
  business type, and that every preset maps to a valid role whose permission
  set matches the documented matrix.
