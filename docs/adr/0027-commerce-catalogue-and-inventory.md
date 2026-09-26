# ADR-0027: Commerce catalogue and inventory (Milestone 3)

- Status: Accepted
- Date: 2026-09-25
- Refines: ADR-0008 (RBAC), ADR-0010 (money), ADR-0015 (media), ADR-0018
  (search), ADR-0020 (staged schema), ADR-0022 (entitlements), ADR-0024
  (business types)

## Context

Milestone 3 promotes the catalogue, media and inventory models from the
approved draft (`docs/database/schema.draft.prisma`,
[09-commerce.md](../architecture/09-commerce.md)) and builds the first
merchant commerce workflows. Building them surfaced decisions the draft
leaves open (what happens to variant data when options change, what an
archived product costs against the plan, where uploads go without MinIO)
and a few small model refinements. They are recorded here before
implementation, as ADR-0020 requires.

## Decision

### 1. What is promoted

`MediaAsset`, `Product`, `ProductOption`, `ProductOptionValue`,
`ProductVariant`, `ProductVariantOptionValue`, `ProductMedia`, `Collection`,
`CollectionProduct`, `Location`, `InventoryItem`, `InventoryLevel` and
`InventoryMovement`. Every table gets RLS (`FORCE`), the immutable-owner
trigger, composite same-store foreign keys, the partial unique indexes and
CHECKs listed in [erd.md §6](../database/erd.md#6-constraints-added-in-sql-migrations),
and least-privilege grants.

Two same-store rules are triggers rather than foreign keys, because Prisma
can't model them and would drop them as drift: optional media references
(`ProductVariant.imageMediaId`, `Collection.imageMediaId`,
`Store.logoMediaId`, `Store.faviconMediaId`) must point at media in the same
store, and a variant's option values must come from its own product's
options. The app role can't delete media, so a reference can't dangle; the
purge job (later) clears references before removing an asset.

Not promoted in M3: `InventoryReservation` (checkout, M6), the product
taxonomy (`Category`, with tax in M6), smart-collection rules (the `type`
and `rules` columns exist; the service accepts `MANUAL` only), and the Admin
API v1 with API keys (moved to M6 with outbound webhooks, when the first
external consumer exists).

### 2. Model refinements (draft, ERD and live schema change together)

| Model                     | Change                                                         | Why                                                                                      |
| ------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Product`                 | `+ archivedAt`, `+ createdById`, `+ updatedById` (→ `User`)    | Archive time and authorship for the editor and audits. `SET NULL` when a user is deleted |
| `Collection`              | `+ archivedAt` (migration `20260929000000_collection_archive`) | Collections archive and restore like products; archived ones leave pickers and lists     |
| `Location`                | `+ code` (unique per store among live locations)               | Short stable reference for inventory screens and future imports ("MAIN", "WH-2")         |
| `InventoryMovementReason` | `+ INITIAL`                                                    | The first stock recorded for an item at a location is not a correction or a restock      |
| `ProductVariant`          | soft delete also rewrites `optionSignature` to `deleted:<id>`  | Frees the combination for a new variant while the deleted row keeps its ledger (§5)      |

On hand is not a column: **on hand = available + reserved**, as the draft
says. `reserved` stays 0 until checkout reserves stock in M6.

### 3. Money

`@storevia/commerce/money` implements ADR-0010 exactly (bigint minor units,
ISO-4217 exponent table, currency always attached, mixed-currency operations
throw, explicit rounding, largest-remainder allocation, string amounts in
JSON). A variant's `currency` must equal its store's currency; the store
currency is fixed at store creation, so every price in a store shares it.
CHECKs: price ≥ 0, cost ≥ 0, compare-at > price when set.

### 4. Handles (product and collection slugs)

Stored as `handle` (the draft's name; the UI says "URL handle"). Lower-case
`a-z`, `0-9` and single hyphens, 1–100 characters, generated from the title
(Latin diacritics folded; `product-2`, `product-3` on collision). Unique per
store among live rows (partial unique index). A small reserved list
(`new`, `edit`, `search`, `cart`, `checkout`, `account`, `admin`, `api`,
`all`, …) is refused so storefront routes (M4) never collide. An explicit
edit that collides is a validation error, never a silent rename. Handle
changes are allowed; the audit record keeps the previous handle, so M4's
redirect table can be backfilled. Redirects themselves belong to M4.

### 5. Options, variants and destructive edits

- ≤ 3 options per product, ≤ 50 values per option, ≤ 100 live variants per
  product (keeps the matrix, the editor and storefront queries bounded).
- A product without options has one default variant (`optionSignature =
""`, title "Default").
- Option edits are applied by a pure **reconciliation** function: variants
  whose value combination survives keep their id, SKU, prices, inventory
  and media; adding an option gives existing variants its first value;
  removing an option keeps the first variant for each remaining
  combination. New combinations get new variants priced like the first
  existing one.
- If the plan removes variants, the service returns the list (with what each
  holds: SKU, barcode, price, stock, image) and applies nothing until the
  caller confirms exactly those variants. Nothing is discarded silently.
- A removed variant with **no inventory history** is deleted with its
  inventory item. A variant **with history** is soft-deleted (`deletedAt`,
  signature rewritten, option links removed): the append-only ledger keeps
  pointing at it, and Orders (M6) keep snapshots anyway.

### 6. Archive, never hard-delete

Products are archived (`status = ARCHIVED`, `archivedAt`) and collections by
`archivedAt`; both are restorable and never hard-deleted in M3. `deletedAt` exists for the purge
policy in [data-lifecycle.md](../database/data-lifecycle.md), which a later
job implements. Order history (M6) is safe because orders snapshot product
data and `OrderLine` references use `SET NULL`.

### 7. Product limit (commercial policy)

`product_limit` counts products that are **not archived**, organisation-wide
(the feature's documented meaning). It becomes a gauge feature:

- creating a product and un-archiving one consume usage in the same
  transaction (`consumeUsage`, row-locked, so parallel creators can't pass
  the limit);
- archiving releases usage;
- activating a draft doesn't change usage;
- over the limit after a downgrade, existing products stay editable,
  activatable and visible; creating and un-archiving are blocked
  ([05-billing-entitlements.md](../architecture/05-billing-entitlements.md)
  over-limit table). Nothing is deleted;
- `reconcileUsage` recounts it from the table. Products are store-scoped but
  the limit is organisation-wide, so the count comes from a `SECURITY
DEFINER` function that sums the organisation's stores and refuses any
  organisation but the caller's (the same for media bytes).

### 8. Inventory

- `ProductVariant → InventoryItem (1:1) → InventoryLevel (per location)`.
  `InventoryItem.tracked = false` means "don't track quantity".
- **One write path:** `adjustInventory` (and `moveInventory`, `setInventory`
  built on it). Each change locks the level rows in a deterministic order
  (`inventoryItemId, locationId`), applies a conditional update in SQL
  (`available = available + d`, refusing a negative result unless the
  variant's policy is `CONTINUE`), and appends an `InventoryMovement` with
  `resultingValue` in the same transaction. "Set to N" reads the level
  **under the row lock** and converts it to a delta. Nothing reads stock,
  computes in memory and writes back.
- `InventoryMovement` is append-only (the app role has no `UPDATE`/`DELETE`).
  `InventoryLevel` has no `DELETE` grant.
- M3 movement reasons: `INITIAL`, `MANUAL_ADJUSTMENT`, `RESTOCK`,
  `CORRECTION`, `TRANSFER`. `SALE`, `RETURN`, `CANCELLATION`,
  `RESERVATION*`, `FULFILMENT` and `RECEIVED` stay unused until the flows
  that produce them exist.
- A manual adjustment records the delta, location, reason, optional note and
  the acting user.
- A store gets a "Main location" (`MAIN`) the first time the catalogue needs
  one: initial stock on a new product, or a stock change that names no
  location (so a store's first product with variants can be stocked before
  anyone creates a location). Creating it takes no `location.manage`: it is
  part of the stock write. A store always keeps at least one active location; locations are
  deactivated, not deleted, in M3.
- Low stock is `0 < available ≤ 5` summed across active locations
  (a store setting later); out of stock is `≤ 0` for tracked, `DENY`
  variants.

### 9. Media (amends ADR-0015 for M3)

- `packages/media` defines `ObjectStorage` (create upload target, head,
  read, write, delete, public URL) with two adapters: **S3** (any
  S3-compatible service, signed POST policies with size and content-type
  conditions) and **local filesystem** for development and tests (uploads go
  to a dashboard route that verifies a short-lived HMAC token and enforces
  the same size limit). The adapter is chosen by configuration; the local
  adapter refuses to start when `STOREVIA_ENV=production`. Commerce code
  sees only the interface.
- Object keys are server-generated (`{organisationId}/{storeId}/{mediaId}/…`);
  the filename is metadata only. Raw uploads go to a separate prefix,
  `uploads/{organisationId}/{storeId}/{mediaId}`, which is never served and
  is deleted once processed (and expired by a bucket lifecycle rule); the
  database CHECK accepts only these exact key forms. _(Amended after the
  M3 security review, `docs/architecture/11-testing.md`.)_
- An upload target is bound to the declared size and to its upload key
  (never an asset key); the S3 POST policy pins `Content-Type:
application/octet-stream`. A store may have at most 20 pending uploads
  started in the last hour.
- Accepted in M3: JPEG, PNG, WebP, GIF and AVIF images up to 20 MB and 40
  megapixels. The type is decided by **magic bytes**, never the extension or
  the declared type. **SVG is refused** for product media (it can carry
  script); video and documents come later.
- Processing (sniff, decode with sharp, strip metadata including EXIF GPS,
  WebP renditions at 320/640/1280/2048 px wide, never upscaled: a smaller
  image gets one rendition at its own width) runs when the upload is
  completed, in the request, bounded by the limits above, by two
  processing slots per process and a 20-second sharp timeout (AVIF at low
  effort). A processing or write failure deletes the raw upload and marks
  the asset `REJECTED`. Moving it to the
  worker is a later scaling step; the `PROCESSING` state already exists.
- `media_storage` (bytes) is consumed when an upload completes (original +
  renditions) and released when an unreferenced asset is soft-deleted.
  Uploads are refused when the plan is at its limit; existing media keeps
  working. Deleting media removes its objects (original, renditions, raw
  upload) after the transaction commits, so released bytes are never still
  served; a failed object delete is logged by key for the purge job.
- Media references (variant, collection and product media) must point at
  `READY`, non-deleted media in the same store; the check locks the asset
  `FOR SHARE` so it serialises with deletion.
- Media is served with the stored, sniffed content type, `nosniff` and a
  sandboxing CSP; in production from the user-content domain. In
  development the dashboard serves local objects at `/media/…`, only
  cleaned originals and renditions, never the raw upload; the dashboard CSP
  allows the configured media origin for images and uploads. The local adapter is allowed only when `STOREVIA_ENV` is `development`
  or `test` and needs a non-empty upload secret.

### 10. Rich text

Descriptions are Tiptap/ProseMirror JSON (`descriptionDoc`), validated
against an allow-list of nodes and marks (paragraph, headings 2–4, bold,
italic, strike, code, links with `http`, `https` or `mailto` only, lists,
blockquote, hard break, horizontal rule). `descriptionHtml` is rendered on
the server from the validated document by an escaping serializer. No input
path accepts HTML. The storefront (M4) renders the same document.

### 11. Search

`SearchIndex` (ADR-0018) with a PostgreSQL implementation: a generated
`tsvector` over title, handle, vendor, product type and tags (GIN), and
`pg_trgm` indexes for SKU, barcode and title fuzzy matching. The store scope
is a mandatory argument of every query. Lists use keyset pagination.

### 12. Permissions (amends ADR-0008's catalogue)

- `product.delete` becomes **`product.archive`** (same roles): products are
  archived, never deleted.
- `collection.read` and `media.read` join the base read set every member
  has.
- New **`location.manage`**: owner, admin, store manager, inventory manager.
- Everything else keeps its existing primitive (`product.create`,
  `product.update`, `collection.manage`, `inventory.read`,
  `inventory.adjust`, `media.manage`). There is no second permission engine.

### 13. Export, import and bulk actions

- **CSV export** of the product list is available to any member with
  `product.read`. It is not gated by the `export` plan feature: that
  feature means the full data export of Milestone 8, and a merchant's own
  product list is not a paid extra. Cells that a spreadsheet would treat as
  formulas are neutralised. The export is audited (`product.exported`).
- **Import** is an interface only (`CatalogueImporter`); the CSV importer
  is deferred.
- **Bulk actions** (activate, draft, archive, restore, add/remove tags, add
  to collection) take at most 100 products, check the same permission and
  limits per product, and report each product that failed and why; the
  others are applied.

### 14. Platform staff

Staff see catalogue **diagnostics only** (counts by status, variants,
locations, tracked items, media bytes, stock anomalies, products per
store), read by `@storevia/billing` through the platform role's
column-level grants, which cover ids, statuses, sizes and stock figures and
never titles, descriptions or prices. Staff don't edit catalogues.

### 15. Business type

Commerce services never read the business type. It decides only navigation
emphasis, onboarding suggestions and dashboard widgets (ADR-0024). An
authorised member of an entitled store can use the catalogue whatever the
store's type.

## Consequences

- The catalogue is usable end to end without a storefront; M4 reads it
  through the same services and DTOs.
- Variant edits need a confirmation round trip when they would remove data,
  which the editor makes explicit.
- In-request image processing bounds upload size; very large images and
  video need the worker path later.
- Soft-deleted variants accumulate for products with history; they are small
  and excluded from every list.

## Alternatives considered

- **Hard-deleting variants with stock history:** breaks the append-only
  ledger (movement → item is `RESTRICT`).
- **Counting archived products against the plan:** contradicts the feature's
  documented meaning and would punish merchants for keeping history.
- **Proxying uploads through the app in production:** ADR-0015 rejects it;
  only the local development adapter receives bytes in the app.
- **Storing sanitised HTML as the canonical description:** loses structure
  the storefront renderer (M4) and builder (M5) need.
