# 06 — Storefront architecture

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**. ADR-0013, refined for Milestone 4 by ADR-0028.
>
> **Implemented in Milestone 4** (`apps/storefront`, `packages/domains`,
> `packages/site-engine`, `@storevia/commerce/storefront`,
> `packages/editor`). Generic public-site infrastructure is the Site Engine
> and commerce composes into it (ADR-0029). Where M4 differs from
> the baseline below, the section says so in an "M4" note; ADR-0028 records
> why.

## 1. One engine, every store

`apps/storefront` is a single multi-tenant Next.js application. No per-merchant
build, deployment or code generation. Each request is resolved as:

```text
hostname → StoreDomain → Store → live StoreTheme (+ ThemeVersion) → route → Page / template → PageDocument → render tree
```

## 2. Request pipeline

```mermaid
sequenceDiagram
  participant U as Shopper
  participant E as Edge (CDN/WAF/TLS)
  participant P as Next.js proxy (request interception)
  participant R as storefront-engine resolver
  participant C as Cache
  participant DB as PostgreSQL
  U->>E: GET https://shop.example.com/products/blue-shirt
  E->>P: forwarded with Host header (edge validates host is a known hostname)
  P->>R: resolveStoreFromHostname("shop.example.com")
  R->>C: host:{hostname}
  alt miss
    R->>DB: app_storefront_resolve(hostname)
    R->>C: set (30 s, dropped early by host:/store: invalidations)
  end
  R-->>P: {storeId, organisationId, status, primaryHostname}
  alt host is not primary
    P-->>U: 301 → https://{primary}/products/blue-shirt
  else store not ACTIVE
    P-->>U: rewrite → /status/{coming-soon|unavailable}
  else
    P->>P: rewrite → /sv/{storeId}/products/blue-shirt (internal route)
  end
```

- **Hostname normalisation** (`packages/domains`): lower-case, strip port and
  trailing dot, IDNA → punycode, reject IP literals and anything not matching
  hostname syntax. Unknown hosts get a generic 404 page with no store data.
- The internal `/sv/{storeId}/…` segment is **not reachable directly**:
  the proxy prefixes **every** path with the resolved store, so a request
  for `/sv/{other}/…` becomes `/sv/{this}/sv/{other}/…` and 404s, and the
  store layout also checks a signed header set by the proxy (ADR-0028 §4).
- **Canonical host:** each store has one `isPrimary` domain. All other active
  domains (including the `storevia.site` subdomain once a custom domain is
  primary) redirect `301` to it, preserving path and query. Redirect targets
  come only from `StoreDomain` rows, never from request input, so there is no
  open redirect.
- **Custom domains (M7, ADR-0032):** a merchant's domain becomes a
  `StoreDomain` row (`CUSTOM`) that is served only once `ACTIVE`: Storevia's
  ownership TXT record plus the hosting provider's verification, routing
  and certificate. The storefront never asks the provider or DNS anything;
  the dashboard and the worker (`domains.verify`) do, and the resulting
  status change invalidates `host:{hostname}` and `store:{id}`. A primary
  is always ACTIVE (database constraint); when a primary custom domain is
  removed or fails for good, the store's platform address is primary again.
  See [production-hosting.md](../deployment/production-hosting.md).
- **Store status:** `ACTIVE` → serve; `DRAFT` → "coming soon" page (the
  merchant previews with a signed preview token); `SUSPENDED` (store or
  organisation), `ARCHIVED` or an organisation pending deletion → 503
  unavailable page. The subscription status is not consulted: an expired
  subscription falls back to the system-default floor (ADR-0028 §3).
- **M4:** the status pages are `/status/coming-soon` (`200`, `noindex`)
  and `/status/unavailable` (`503`, `noindex`); neither shows
  store data beyond its name. Unknown hosts get a generic `404` built in the
  proxy.
- **Database access:** the storefront connects as `storevia_storefront`,
  resolves hosts through one narrow `SECURITY DEFINER` function, and reads
  everything else under restrictive, sellable-only row policies and column
  grants (ADR-0028 §2).

## 3. Routes

| Route                         | Content source                                                 | Cache                                              |
| ----------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| `/`                           | `Page(kind=HOME)`                                              | cached, tags `store`, `page`, `theme`, `nav`       |
| `/pages/{handle}`             | `Page(kind=STANDARD)`                                          | cached                                             |
| `/products/{handle}`          | `Page(kind=PRODUCT_TEMPLATE)` + product data                   | cached, + `product:{id}`                           |
| `/collections/{handle}`       | `Page(kind=COLLECTION_TEMPLATE)` + collection data (paginated) | cached, + `collection:{id}`                        |
| `/search?q=`                  | `Page(kind=SEARCH_TEMPLATE)` + search results                  | short TTL, cache key includes the normalised query |
| `/cart`                       | Storevia cart component (theme-styled)                         | dynamic, `private, no-store`                       |
| `/checkout/{token}`           | Storevia checkout (restricted styling)                         | dynamic, `no-store`                                |
| `/account/*` (after M6)       | customer pages                                                 | dynamic                                            |
| `/sitemap.xml`, `/robots.txt` | generated per store                                            | cached                                             |
| anything else                 | `Page(kind=NOT_FOUND)` with status 404                         | cached                                             |

**M4:** checkout and customer accounts arrive with M6. The cache column is
the baseline design; M4 caches page data in process under the tags in §5
(`store`, `catalogue`, `product`, `pages`, `host`), and `/search` results
are cached by the normalised query and page. `/cart` and cart actions are
dynamic and `private, no-store`.

**M5:** `/` renders the store's published HOME page and `/pages/{handle}`
its published content pages (ADR-0030). Every store has a HOME page: a
migration gave existing stores one, and a trigger creates one for every
new store, with truthful starter content. Existing URLs are unchanged.
Handle changes don't redirect yet (the old address returns 404).

Routes are Storevia-defined. Merchants control page content and handles, not
the routing table. Products, collections and pages use typed references
(ADR-0012), so renaming a handle can add a redirect row (M4 follow-up) without
breaking navigation.

## 4. Rendering

1. Load the published `PageVersion.document` (via `Page.publishedVersionId`)
   and the live `StoreTheme.publishedSettings`.
2. **Upgrade** the document to the current schema version in memory if needed
   ([07-page-builder-document.md](./07-page-builder-document.md) §7).
3. **Collect data bindings**: walk the tree once and gather every data
   requirement (`ProductGrid` → collection X, limit 8; `Product` → current
   product; `Navigation` → menu "main-menu").
4. **Resolve in batch**: one query per binding type (e.g. all products for
   all grids in one `WHERE id = ANY($1)`), never per node, so no N+1.
5. **Render** with React Server Components using the component registry's
   renderers. Only interactive leaves (add-to-cart, variant picker, cart
   drawer, search box) are client components.
6. Design tokens from theme settings are emitted once as CSS custom properties
   on `:root` (`--sv-color-primary`, …); node styles compile to scoped classes.

**M4:** stores render from Storevia's default page documents and a fixed
default theme (ADR-0028 §6).

**M5:** pages render their published document with `STOREVIA_REGISTRY`
(Site Engine sections plus commerce blocks). `resolveDocumentData` walks the
document once and resolves each kind in one batch: product lists by source,
collection lists, handles, page links and media. The layout emits the
store's theme tokens (`themeCss` of the published settings) and renders the
main and footer menus; until a main menu is saved, the header lists
collections as in M4. Unknown or invalid blocks are skipped and logged
(metrics `storefront.unknown_component` and
`storefront.invalid_component`; a stored document that fails validation is
`storefront.invalid_document`), never rendered. When the first
section has no heading, a visually hidden `h1` keeps one per page. Package
boundaries: [ADR-0030 §2](../adr/0030-site-presentation-builder-themes-navigation.md). There are **no client components** on store pages:
add to cart, quantity changes and search are HTML forms posting to server
actions or `GET` routes, so they work without JavaScript. The only client
module is the error boundary Next.js requires, guarded by a unit test (§10).

All storefront data access goes through `@storevia/commerce/storefront`
read models, which return **public DTOs** (explicit field selection: no cost
price, no inventory counts beyond an availability flag, no internal notes) and
only `ACTIVE`, published, non-deleted records.

## 5. Caching and invalidation

- Cached rendering with **cache tags**: `store:{id}`, `page:{id}`,
  `product:{id}`, `collection:{id}`, `theme:{storeThemeId}`, `nav:{id}`,
  `host:{hostname}` (as implemented: `domain.changed` events name every
  affected hostname, e.g. both hosts of a primary switch).
- Invalidation is **event-driven**: `publishPage()`, product updates, theme
  publish, navigation save and domain changes write `OutboxEvent`s; the
  worker calls the revalidation endpoint (authenticated with a service
  token) and purges the CDN by tag where supported.
- The edge CDN caches storefront HTML for short periods
  (`s-maxage=60, stale-while-revalidate=600`) only for anonymous requests
  without a cart/customer cookie that affects the page. Cart state is
  fetched client-side or rendered only on dynamic routes, so product pages
  stay cacheable.
- Cache keys never include user input except normalised, bounded values
  (search query, page number), to prevent cache poisoning and key
  explosion.

**M4 implementation** (ADR-0028 §9):

- Pages render dynamically (so `404` and `503` are real status codes), over
  an in-process **tag-indexed data cache**: single-flight loads, an LRU
  bound of 5,000 entries and a 5-minute TTL as a safety net. Tags are
  `store:{id}`, `catalogue:{storeId}`, `product:{id}`, `pages:{storeId}` and
  `host:{hostname}`; `@storevia/domains` maps each outbox event to its tags
  for both the worker and the storefront.
- Outbox events are written by **database triggers** on every table a
  shopper can see (catalogue, availability-changing stock movements,
  pages, store, domains, organisation status), in the same transaction as
  the change. The worker's `storefront.outbox-dispatch` job posts the tags
  every 15 seconds to `/api/internal/revalidate`, signed with
  `STOREFRONT_REVALIDATE_SECRET` over a timestamp and the body.
- **M5:** theme and menu changes emit `theme.changed` and
  `navigation.changed` (triggers on `StoreTheme` and `Navigation`), and
  `page.changed` now also refreshes the design. All map to the
  store-scoped `design:{storeId}` tag, which the chrome (theme tokens and
  menus) carries; page data keeps its `pages:` tag. The `store:` tag, which also flushes host resolution, isn't used
  for them.
- The cache is per process: running more than one storefront instance
  needs the invalidation fanned out to every instance or a shared cache
  handler. Edge caching and CDN purge by tag are M8.

## 6. Cart

- Cart identity: an opaque 256-bit token in a host-only cookie
  `__Host-sv_cart` (`Secure`, `HttpOnly`, `SameSite=Lax`); the DB stores its
  SHA-256. Plain-HTTP development uses `sv_cart` without `Secure`.
- **M4:** carts expire 30 days after their last change and hold at most 50
  lines of 1–99 each. Mutations are rate limited per client address and
  per cart. Stock is checked but not reserved (reservations are M6). The
  cart page shows lines whose product stopped being sellable as
  unavailable and leaves them out of the subtotal.
- Cart mutations are server actions on the storefront. They validate the
  variant belongs to **this** store, is `ACTIVE` and purchasable, and refuse
  (never clamp) a quantity above 99 or above what stock can supply, using
  `app_variant_stock()`, the rule checkout reserves by (ADR-0031 §1). The cart
  page shows "Only N available" for limited stock, marks lines stock can no
  longer supply, and disables checkout until they are changed.
- Cart prices shown to the shopper come from `calculateCart()` on the server.
  The cart table holds no prices.

## 7. Checkout

Checkout belongs to the commerce engine, not the page builder
([09-commerce.md](./09-commerce.md) §5). It is rendered on the store's own host
(`/checkout/{token}`) so custom-domain stores keep their domain. The builder
can style it only within permitted boundaries: logo, colours and fonts from
theme tokens, and a few content slots. It cannot add arbitrary components or
scripts to checkout.

## 8. Preview

The dashboard requests a **preview token** (signed, 15 min, bound to
`storeId` + `pageVersionId` or `storeThemeId`). The storefront renders the
draft with `Cache-Control: no-store`, `X-Robots-Tag: noindex` and a preview
banner. Preview tokens never grant access to other stores or to admin data.

**M4:** the only scope is `store` (see a "coming soon" store as it will
look live). Store settings → Storefront → "Preview storefront" (needs
`design.edit`) opens `https://{primary}/?preview={token}`; the proxy
verifies the token against the resolved store, moves it into a host-only
`HttpOnly` cookie (`__Host-sv_preview`) that expires with it, and
redirects to the same URL without the token, with `Referrer-Policy:
no-referrer`.

**M5:** the same store-scoped token shows the store's **drafts**: draft page
versions and draft theme settings. No second token type was added. With a
verified preview the Site Engine opens its transaction with
`app.preview = 'on'`, and only then do the storefront role's policy (draft
`PageVersion` rows of this store) and `app_storefront_theme_settings()`
(draft settings) return drafts. Preview reads bypass the shared data
cache. The builder's Preview button opens the page being edited
(`/s/{storeId}/preview?path=/pages/{handle}`; the path must be `/` or a
content page, anything else opens `/`). The builder's canvas doesn't use
the storefront: it renders in the dashboard under the merchant's own
tenant-scoped transaction.

## 9. Security

- The storefront has **no merchant-admin endpoints**. It imports only read
  models and shopper actions (cart, checkout, customer account).
- Strict CSP with nonces. Merchant `CustomHTML` is rendered in a sandboxed
  iframe (`sandbox` without `allow-same-origin`) or sanitised; see
  [07-page-builder-document.md](./07-page-builder-document.md) §8.
- Per-IP and per-store rate limits on cart, checkout, search and customer
  auth endpoints.
- SEO: canonical URLs point at the primary domain; draft/preview/password
  pages are `noindex`.

## 10. Performance budget

The original fixed budget of "< 90 kB gzip of JavaScript on a product
page" is withdrawn (ADR-0029 §4): the Next.js App Router's client runtime
alone is larger, and no application change can meet it. It is replaced by
measurements and regression controls.

**JavaScript, measured on 2026-09-26** (production build, Next.js 16.3,
React 19.3; gzip level 6; the E2E check measures the same numbers on
every CI run):

| Route                               | Scripts loaded | Total gzip | Route's own increment |
| ----------------------------------- | -------------- | ---------- | --------------------- |
| Home `/`                            | 7              | 173.9 kB   | 0                     |
| Content page `/pages/{handle}` (M5) | 7              | 173.9 kB   | 0                     |
| Product `/products/{handle}`        | 7              | 173.9 kB   | 0                     |
| Collection `/collections/{handle}`  | 7              | 173.9 kB   | 0                     |
| Search `/search?q=`                 | 7              | 173.9 kB   | 0                     |
| Cart `/cart`                        | 7              | 173.9 kB   | 0                     |

Of the shared 173.9 kB, **173.5 kB is the framework runtime** (React DOM,
the RSC client, the App Router and Turbopack's runtime; six chunks) and
**0.35 kB is Storevia's own client code**: the error boundary Next.js
requires, the only `"use client"` module in the storefront, the Site
Engine and the editor. Every route loads exactly the same scripts, so
pages add no client JavaScript of their own; add to cart, quantities and
search are HTML forms.

Regression controls:

- `apps/dashboard/e2e/storefront-budget.spec.ts` loads home, product,
  collection, search and cart on a live store and fails if a route's own
  increment exceeds 8 kB gzip, if the shared baseline exceeds the recorded
  173 kB by more than 15%, or if any loaded script contains code from the
  editor (ProseMirror/Tiptap), charts, auth, platform-admin or merchant
  services.
- `apps/storefront/src/lib/budget.test.ts` fails on any `"use client"`
  module in the storefront, the Site Engine or the editor besides the error
  boundary.
- The storefront's ESLint boundary forbids importing the dashboard UI kit,
  Tiptap, chart libraries, auth, billing, entitlements, tenancy and merchant
  commerce services.

Other budgets:

| Metric                              | Budget       | Status                                                                                                                                                       |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cached HTML TTFB (edge hit)         | < 100 ms p75 | no edge yet (M8). Origin with warm data cache: 12–40 ms (local)                                                                                              |
| Uncached render (origin)            | < 500 ms p95 | 27–69 ms after the process warmed up; the first request after a start took 573 ms (local)                                                                    |
| LCP (4G, mid-range phone)           | < 2.5 s p75  | not measured; needs field data on real hosting (M8)                                                                                                          |
| DB queries per uncached page render | ≤ 8          | **met and enforced**: home, product, collection and search each ≤ 8 with site and catalogue reads together; product lists cost the same for 2 or 40 products |

Timings are development-machine numbers from a local production build
(one process, local PostgreSQL), not p75/p95 from real traffic.

**Milestone 5 re-measurement (2026-09-27)**, after stored pages, themes and
menus: the JavaScript table is unchanged (same 7 scripts, 173.9 kB, no
route increment), and the content-page route is covered too. The budget
spec now also records the browser's own web vitals per route and fails on
CLS > 0.1 or LCP > 2.5 s:

| Route      | LCP (local) | CLS | TTFB (local) | HTML  |
| ---------- | ----------- | --- | ------------ | ----- |
| Home       | 144 ms      | 0   | 52 ms        | 46 kB |
| Content    | 60 ms       | 0   | 22 ms        | 43 kB |
| Product    | 76 ms       | 0   | 42 ms        | 47 kB |
| Collection | 84 ms       | 0   | 38 ms        | 44 kB |
| Search     | 68 ms       | 0   | 32 ms        | 44 kB |
| Cart       | 80 ms       | 0   | 22 ms        | 42 kB |

Queries (`packages/commerce/tests/site.int.test.ts`, "query budget (M5)"):
a stored page with one of **every** section, three product lists of
different kinds, a collection list, links and images costs **7 queries**,
the same with 1 or 12 images and products; the store chrome (theme, both
menus, their links, the collection fallback) costs **5**, cached separately
under `design:`. Theme tokens are one inline `<style>` of custom
properties; system font stacks load no font files.
