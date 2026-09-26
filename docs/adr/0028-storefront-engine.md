# ADR-0028: Storefront engine (Milestone 4)

- Status: Accepted
- Date: 2026-09-26
- Refines: ADR-0011 (page documents), ADR-0012 (themes and pages),
  ADR-0013 (one storefront), ADR-0016 (hosting, domains), ADR-0020 (staged
  schema), ADR-0022 (subscription lifecycle)

## Context

Milestone 4 makes stores visible on the web
([06-storefront.md](../architecture/06-storefront.md)): hostname
resolution, the page-document schema and base renderers
([07-page-builder-document.md](../architecture/07-page-builder-document.md)),
public read models, cart, caching, SEO and preview. The storefront is the
first surface that serves **anonymous** traffic from every tenant in one
process, so the way it reaches the database and decides which store a
request belongs to is the main security decision. Several details are also
left open by the baseline: which models M4 promotes when the page editor
(M5), themes (M7) and customers (M6) come later, what the storefront shows
after a subscription expires, and how cached pages are invalidated. They are
recorded here before implementation, as ADR-0020 requires.

## Decision

### 1. What is promoted

From the approved draft: `Page`, `PageVersion` (with `PageKind`,
`PageVersionState`), `Cart`, `CartLine` (with `CartStatus`) and
`OutboxEvent`. New in the draft and live together: `StoreSlugHistory`
(§12).

Not promoted yet, with the milestone that owns them:

| Model                                            | Owner | Until then                                                                    |
| ------------------------------------------------ | ----- | ----------------------------------------------------------------------------- |
| `Navigation`, `NavigationItem`                   | M5-13 | the storefront header links home, search, cart and up to eight collections    |
| `Theme`, `ThemeVersion`, `StoreTheme`            | M7    | one built-in theme token set (§6)                                             |
| `Customer` (and `Cart.customerId`'s foreign key) | M6    | `Cart.customerId` exists, always null, no foreign key; M6 adds the constraint |

`Page`/`PageVersion` are promoted with their database invariants (a page
publishes only its own version; published and archived documents are
immutable) and a read path. Page write services (`saveDraft`, `publish`)
belong to M5-06; M4 tests create pages through the migrator.

### 2. A dedicated storefront database role

The storefront connects as **`storevia_storefront`** (`LOGIN NOBYPASSRLS`,
`DATABASE_STOREFRONT_URL`), never as `storevia_app`:

- **Host resolution** is the only cross-tenant read. It goes through one
  `SECURITY DEFINER` function, `app_storefront_resolve(hostname)`, which
  returns a narrow tuple for an `ACTIVE` domain: store and organisation ids,
  their statuses, the store's primary hostname, name, currency, locale and
  country. Nothing else is readable without a store scope.
- Every other read runs in `withStorefront(scope, fn)`: a transaction that
  sets `app.organisation_id` and `app.store_id` **from the resolver result
  only** (never from the path, a header, a cookie or a form field), so the
  existing `tenant_isolation` policies confine it to one store. Read models
  run the transaction `READ ONLY`.
- **Restrictive policies** `TO storevia_storefront` narrow each table to what
  is sellable: `ACTIVE`, non-deleted products; non-deleted variants of those
  products; non-archived, non-deleted collections; `READY`, non-deleted
  media; non-deleted pages and `PUBLISHED` page versions. A bug in a read
  model therefore can't show a draft product, an archived collection or an
  unpublished page.
- **Column grants** omit cost, barcode, SKU, audit authors, search
  internals and platform-controlled columns. Rich text is granted as its
  validated document (`descriptionDoc`) and rendered by React from the
  allow-list, never as stored HTML, so a tampered HTML column can't reach a
  shopper. There is no grant on inventory tables:
  availability comes from `app_storefront_availability(variant_ids)`, a
  `SECURITY DEFINER` function that returns one boolean per variant of the
  current store and never a count.
- No grant on members, audit, billing, locations, the ledger or any other
  administrative table. Cart tables are the only writable tenant tables.

### 3. Storefront availability per status (M2-08)

| Store / organisation state                                  | Storefront                                       |
| ----------------------------------------------------------- | ------------------------------------------------ |
| store `ACTIVE`, organisation `ACTIVE`                       | live                                             |
| store `DRAFT`                                               | "Coming soon" (200, `noindex`); preview shows it |
| store `SUSPENDED` or organisation `SUSPENDED`               | "Store unavailable" (503, `noindex`)             |
| store `ARCHIVED`, organisation `PENDING_DELETION`/`DELETED` | "Store unavailable" (503, `noindex`)             |
| unknown or non-`ACTIVE` hostname                            | generic 404 with no store data                   |

The subscription status is **not** consulted. An expired subscription falls
back to the system-default floor (ADR-0022), and the over-limit rules in
[05-billing-entitlements.md](../architecture/05-billing-entitlements.md) §1
already keep existing stores working. Taking a store offline for
non-payment is a platform decision (suspension), not an implicit side effect
of a billing state, and it never depends on a plan name.

### 4. Routing and the internal store segment

`apps/storefront/src/proxy.ts` runs on every request:

1. Normalises `Host` with `@storevia/domains` (§12); anything that isn't a
   valid hostname gets the generic 404. Hosts under the dashboard, admin or
   marketing domains never resolve, so `storevia.com` never serves a store.
2. Resolves the store (§2), cached in process for 30 s and invalidated by
   `domain:{hostname}` events.
3. A non-primary host redirects `301` to the primary host with the same
   path and query. The target comes from the database, never the request.
4. Otherwise it **always** rewrites to `/sv/{storeId}{path}`, and sets an
   internal header carrying the store id and an HMAC over it. It never passes
   a path through unprefixed, so a request for `/sv/{otherStore}/…` becomes
   `/sv/{thisStore}/sv/{otherStore}/…` and 404s; the store layout also
   refuses to render unless its `storeId` parameter matches the signed
   header. Incoming `x-sv-*` headers are dropped.

### 5. Page documents and the component registry (M4-00)

`@storevia/editor` gains its document and render entry points now:

- `@storevia/editor/document`: the v1 envelope and node schema (zod), typed
  links and data sources, the closed style vocabulary, limits (≤ 2 000
  nodes, depth ≤ 12, ≤ 1 MiB serialised, ≤ 200 data bindings), unique node
  ids, `upgradeDocument()` (v1 only; the migration framework is M5-01).
- `@storevia/editor/registry`: component definitions with property
  schemas, allowed children/parents/page kinds and data requirements.
- `@storevia/editor/render`: server renderers, the style compiler (tokens →
  `var(--sv-…)`, one scoped `.n-{id}` rule per node with tablet and mobile
  media queries, emitted once in a nonce'd `<style>`), and an allow-list
  rich-text renderer for ProseMirror JSON. Unknown component types are
  skipped and logged.
- Base components: section, container, columns/column, heading, text,
  rich-text, image, button, divider, spacer; and the commerce components the
  M4 routes need: product-detail (gallery, price, variant picker,
  add-to-cart), product-grid, collection-header, collection-products,
  search-results. The rest of the catalogue in 07 §5 is M5.

### 6. Default content and theme

A store renders its published `Page` of the route's kind. Without one, it
renders a **built-in default template** (`@storevia/editor/templates`) for
that kind: the same documents and renderers, stored in code, never written
to the store's tables. The theme is one built-in token set (colours, fonts,
type scale, spacing, radius, container width), emitted as CSS custom
properties on `:root`. M7 replaces it with the live `StoreTheme`.

### 7. Public read models (M4-03)

`@storevia/commerce/storefront` is the storefront's only data access. It
returns public DTOs through explicit selects: prices as money strings, an
availability flag, public media URLs, and the store's own handles. It
batches data bindings by type (one query per binding type, never per node)
so an uncached page render costs **at most 8 queries**, enforced by a
query-count test harness (M4-09).

### 8. Cart (M4-05)

- Identity: 32 random bytes (base64url) in a host-only cookie,
  `__Host-sv_cart` over HTTPS (`Secure; HttpOnly; SameSite=Lax; Path=/`).
  Plain-HTTP development and test use `sv_cart` without `Secure`, because
  browsers refuse `__Host-` cookies without it. The database stores the
  SHA-256 of the token, so a leaked table can't be replayed as cookies.
- A cart is created on the first add and expires 30 days after its last
  change. It holds variant ids and quantities, **never prices**.
- Every mutation is a server action that re-validates the variant against
  **this** store (a variant id from another store is "not found"), requires
  its product `ACTIVE`, clamps quantity to 1–99 and lines to 50, and refuses
  a variant that is out of stock and can't be oversold. There are no
  reservations (M6).
- Subtotal and line totals are computed on the server from current prices
  with the money library each time the cart is shown.
- Mutations are rate limited per client address and store, in the shared
  `RateLimit` table through a `storefront:` key policy (as the marketing
  role does, ADR-0025).

### 9. Caching and invalidation (M4-06)

- Pages render dynamically, so a missing product answers `404` and an
  unavailable store `503` before anything is sent. (With Next.js Cache
  Components, routes that read `params` or headers must stream behind
  `<Suspense>`, which commits a `200` before the data is known; that is
  wrong for a storefront.) The data behind each page is cached in process
  by store and normalised route, in a **tag-indexed cache** with
  single-flight loading, an LRU bound and a 5-minute TTL as a safety net.
  Tags follow 06 §5: `store:{id}`, `catalogue:{storeId}`,
  `product:{id}`, `pages:{storeId}`, `host:{hostname}`. Inputs in cache
  keys are ids and normalised, bounded values only.
- Every change a shopper could see writes an **`OutboxEvent` in the same
  transaction**, from **database triggers** on the catalogue, inventory
  (only when availability can flip), page, store, domain and organisation
  tables, so no service (dashboard, platform staff, worker, or one written
  later) can forget to. Payloads hold ids only; services can neither write
  nor read events directly.
- The worker's `outbox.dispatch` job claims undispatched events
  (`FOR UPDATE SKIP LOCKED`) every 15 seconds, maps them to tags and posts
  them to the storefront's `/api/internal/revalidate`, signed with
  `STOREFRONT_REVALIDATE_SECRET` over a timestamp and the body (stale or
  forged requests are refused), then marks them dispatched in the same
  transaction. A failed post leaves them for the next run; dispatched
  events are purged after 7 days.
- Invalidation drops every entry with a matching tag at once: content a
  merchant removed is never served stale, and a load that raced an
  invalidation of its tags is not stored. Page data, not the cart, is
  cached; the cart page and cart actions are dynamic and `no-store`.
- The cache is per process. More than one storefront instance needs the
  invalidation fanned out to each (or a shared cache); edge caching and
  purge by tag are M8.

### 10. SEO (M4-07)

Per store: `sitemap.xml` (home, active products, collections, published
pages; canonical primary-host URLs), `robots.txt` (`Disallow: /cart`,
`/search`; `Disallow: /` while the store isn't live), canonical links on
every page, and JSON-LD `Product`/`Offer` and `WebSite` built only from
real data (no ratings or reviews). Status, preview and search result pages
are `noindex`.

### 11. Preview (M4-08)

- The dashboard issues a preview link for users with `design.edit`: an
  HMAC-SHA256 token (`STOREFRONT_PREVIEW_SECRET`) over
  `{v: 1, storeId, scope: "store", exp}` with a 15-minute expiry.
- The storefront verifies it against the **resolved** store (a token for
  store A is refused on B's host), sets a host-only, `HttpOnly` preview
  cookie that expires with the token, and renders with `no-store`,
  `X-Robots-Tag: noindex` and a preview banner. It lets a `DRAFT` store be
  seen; it never grants anything else.
- M5 adds a `page-version` scope and M7 a `store-theme` scope to the same
  token format.

### 12. Hostnames, reserved slugs, slug history and the PSL (M4-01, M4-10)

- `@storevia/domains` owns hostname normalisation (lower-case, no port or
  trailing dot, IDNA to ASCII, no IP literals, RFC 1123 labels, ≤ 253
  characters) and re-exports the reserved slug list that store creation
  validates against (`@storevia/validation`).
- A store's slug can change (`domain.manage`). The old platform hostname
  stays as a non-primary `ACTIVE` domain, so old links redirect, and the
  old slug is recorded in `StoreSlugHistory`, which no other store can ever
  claim: an old link can't be taken over by someone else's store.
- Submitting `storevia.site` to the Public Suffix List is an operational
  step (its own browser-cookie isolation between stores); the submission
  checklist lives in `docs/deployment/public-suffix-list.md`. Until it is
  listed, the storefront sets only host-only cookies, which is safe either
  way.

### 13. Boundaries and headers

- `apps/storefront` imports only `@storevia/commerce/storefront`,
  `@storevia/domains`, `@storevia/editor`, `@storevia/security`,
  `@storevia/observability` and `@storevia/types`, enforced by ESLint. It
  has no merchant or staff endpoints and no session cookies.
- Nonce-based CSP, `frame-ancestors 'none'`, images from the media origin
  only, and the base security headers used by the other apps.

## Consequences

- The storefront can't read administrative data even through a bug in its
  own code: the role, restrictive policies and column grants decide what is
  visible, and tests assert it per table.
- Stores go live without the page editor: default templates render every
  route, and M5 only adds a way to publish pages over them.
- Shopper-visible changes emit outbox events by construction (triggers).
  A test per event source checks the event, and the dispatcher's tests
  check the tags each event invalidates.
- Operations gains a role, three secrets (`DATABASE_STOREFRONT_URL`,
  `STOREFRONT_REVALIDATE_SECRET`, `STOREFRONT_PREVIEW_SECRET`) and, for more
  than one storefront instance, a shared cache handler.

## Alternatives considered

- **The app role with a synthetic tenant context.** Rejected: it can read
  drafts, cost prices and every administrative table in the store, so a
  read-model bug would leak them.
- **Consulting the subscription status in the storefront.** Rejected: it
  duplicates the entitlement rule, would take stores offline on a late
  sweep, and contradicts the over-limit rules; suspension already exists.
- **Next.js Cache Components (`"use cache"`) or `unstable_cache`.** Cache
  Components streams dynamic routes behind `<Suspense>`, committing a
  `200` before a product is known to exist; `unstable_cache` is replaced in
  Next.js 16. Both remain options for static parts of a page later.
- **Passing unprefixed paths through the proxy and blocking `/_store`.**
  Rejected: a deny-list of paths is one routing change away from a bypass;
  always prefixing makes the store segment unreachable by construction.
- **Seeding default pages into every store.** Rejected: it writes content
  the merchant didn't create and would need migrating whenever the defaults
  improve; code templates render the same way and M5 publishes over them.
