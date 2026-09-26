# ADR-0029: Site Engine and Storevia Commerce composition

- Status: Accepted
- Date: 2026-09-26
- Refines: ADR-0028 (storefront engine), ADR-0013 (one storefront),
  ADR-0011 and ADR-0012 (page documents, themes)

## Context

Storevia stays an ecommerce SaaS. The approved architecture now separates
generic public-website infrastructure (the **Site Engine**) from
Storevia-specific commerce, so that the public engine can later serve a
different kind of site without carrying catalogue, cart or billing code:

```text
Storevia Public App (apps/storefront)
        │  composes
        ▼
Storevia Commerce Composition
        │  catalogue · products · variants · collections · search · cart
        ▼  depends on
Site Engine
           domains · public context · access state · renderer boundary ·
           branding · media · SEO · caching · security
```

Milestone 4 was built as one "storefront" (ADR-0028). Before changing it,
this ADR records an audit of what was built.

## Audit of Milestone 4 as built

There is no `packages/storefront-engine`. M4 lives in these places:

| Where                                                                                                                                                                                               | What                                                                                                    | Class                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/domains` (hostname, resolver, preview)                                                                                                                                                    | hostname normalisation, host → store resolution and cache, access state, canonical host, preview tokens | **A** (generic)                                                                    |
| `packages/domains/src/cache-tags.ts`                                                                                                                                                                | tag grammar and event → tag mapping                                                                     | **mixed**: `catalogue:`/`product:` tags and product/collection events are commerce |
| `packages/media/src/urls.ts`                                                                                                                                                                        | public rendition URLs, servable-key filter, media origin                                                | **A** (no database or merchant modules in its import graph)                        |
| `packages/editor` document core (envelope, styles, layout/basic components, CSS compiler, rich-text renderer)                                                                                       | page documents and server rendering                                                                     | **A**, but see below                                                               |
| `packages/editor` commerce parts (product/collection link targets and data sources, product-grid/detail, collection and search components, `ProductCardView`s, default templates, money formatting) | commerce page content                                                                                   | **B**                                                                              |
| `packages/editor/src/theme.ts`                                                                                                                                                                      | design tokens (branding)                                                                                | **A**                                                                              |
| `packages/commerce/src/storefront/read.ts`: products, collections, search, product lists, navigation collections, catalogue sitemap                                                                 | public catalogue DTOs                                                                                   | **B**                                                                              |
| `packages/commerce/src/storefront/read.ts`: `publishedPage`, page links, `media`, `imageDto`, page sitemap entries                                                                                  | published site content and public media views                                                           | **A**, wrongly placed in commerce                                                  |
| `packages/commerce/src/storefront/cart.ts`                                                                                                                                                          | cart, cart pricing and inventory rules                                                                  | **B**                                                                              |
| `packages/database`: storefront role, `app_storefront_resolve`, outbox triggers                                                                                                                     | one public read role for site and catalogue tables; triggers per table                                  | shared infrastructure (A and B policies side by side)                              |
| `packages/tenancy/src/storefront.ts`                                                                                                                                                                | go live / coming soon, store address and slug history, preview links                                    | **A** (merchant-side site administration)                                          |
| `apps/storefront/src/lib/store-header.ts`, `request-store.ts`, `env.ts`                                                                                                                             | signed trusted public context, per-request verification, secrets                                        | **A**, trapped in the app                                                          |
| `apps/storefront/src/proxy.ts`                                                                                                                                                                      | host pipeline: normalise, resolve, redirect, preview exchange, access state, rewrite, headers           | **A**, trapped in the app                                                          |
| `apps/storefront/src/lib/cache.ts`                                                                                                                                                                  | tag-indexed data cache                                                                                  | **A**, trapped in the app                                                          |
| `apps/storefront/src/lib/pages-html.ts`, status route                                                                                                                                               | unknown-host and status pages                                                                           | **A** (copy is Storevia's)                                                         |
| `apps/storefront/src/app/api/internal/revalidate`, worker signing                                                                                                                                   | signed invalidation protocol                                                                            | **A** (protocol) / **C** (tag set)                                                 |
| `apps/storefront` robots and sitemap routes, `JsonLd`                                                                                                                                               | robots/sitemap/JSON-LD generation                                                                       | builders **A**, paths and entries **C/B**                                          |
| `apps/storefront/src/components/chrome.tsx`                                                                                                                                                         | skip link, preview banner, brand, footer; collection nav, search and cart links; cart CSS               | **mixed** A/B                                                                      |
| `apps/storefront` routes, `route-data.ts`, `render-context.ts`, cart UI                                                                                                                             | wiring pages, catalogue and cart together                                                               | **C**                                                                              |
| `apps/worker/src/outbox.ts`                                                                                                                                                                         | dispatch loop                                                                                           | **C** (generic protocol, composed tags)                                            |

What is already generic: host security (normalisation, ACTIVE-domain
resolution through one definer function, canonical redirects from
database rows only), access state, preview tokens, media URL delivery,
design tokens, and the whole database layer's isolation model.

What is incorrectly coupled: the generic request pipeline, trusted context,
cache, invalidation protocol, SEO builders and page shell sit inside the
commerce app, so nothing else could reuse them; generic cache tags share a
module with commerce ones; published-page, page-link and media reads live
in the commerce read model; the editor's document core imports commerce
(rich text, money) and mixes commerce components into the same registry.

## Decision

### 1. Packages and dependency direction

- **`@storevia/domains`** stays as it is (hostnames, resolver, preview
  tokens): the dashboard and tenancy use it too. Its commerce cache tags
  move out.
- A new **`@storevia/site-engine`** holds the generic public-site pieces
  that were inside `apps/storefront`, moved rather than rewritten:
  - `context`: the signed public context (`x-sv-store`), its
    per-request verification, and the secrets.
  - `pipeline`: the proxy pipeline (host → resolve → canonical redirect →
    preview exchange → access state → rewrite, security headers).
  - `cache` and `cache-tags`: the tag cache and the generic `store:`,
    `pages:` and `host:` tags.
  - `revalidate`: the signed invalidation protocol, both signing and
    verification.
  - `html` and `seo`: status and unknown-host pages, and builders for
    robots, sitemap, canonical URLs and JSON-LD.
  - `theme`: design tokens, moved from the editor, which re-exports them.
  - `shell`: a minimal merchant-branded shell with header and footer
    slots.
  - `read`: `SiteReader` for published pages, page links, public media
    views and page sitemap entries.

  Its imports are limited to `@storevia/domains`,
  `@storevia/media/urls`, `@storevia/security`,
  `@storevia/observability`, `@storevia/types`,
  `@storevia/database/storefront` and the framework.

- **`@storevia/commerce/storefront`** keeps catalogue, search, cart and the
  commerce cache tags (`catalogue:`, `product:`), and depends on the Site
  Engine (for example `imageDto`, `SiteReader`, the tag grammar).
- **`apps/storefront`** and **`apps/worker`** are the composition: routes,
  the Storevia ecommerce homepage, route data, commerce navigation and cart
  UI, the composed event → tag mapping.

Dependency direction: `apps` → commerce → Site Engine → foundations. The
Site Engine must not import `@storevia/commerce`, `@storevia/editor`
(which imports commerce), `@storevia/billing`, `@storevia/entitlements`,
`@storevia/tenancy`, `@storevia/auth`, `@storevia/payments`, or any app.
This is enforced by ESLint and by an import-graph test that follows every
module the Site Engine loads, so a transitive import through another
package fails too. There are no runtime plugins: composition is ordinary
typed module imports and function arguments.

### 2. Architectural test

Without Storevia Commerce, the Site Engine can resolve a merchant
hostname, establish the signed public context, enforce access state
(live, coming soon, unavailable, preview), deliver safe media URLs,
produce canonical URLs, robots and a sitemap, and render a
merchant-branded shell. An integration test in `packages/site-engine`
does exactly that with a store and domain in the database and no commerce
module loaded. The storefront E2E and the commerce integration tests prove
the second half: commerce composes into the same engine for products,
collections, search and cart.

### 3. Deliberately not moved now

These are recorded so they aren't mistaken for oversights:

- **The editor's document model** (link targets and data sources that
  name products and collections, commerce components, commerce page kinds,
  rich text and money from commerce). Splitting it into a generic document
  core and commerce components needs an extensible reference model, which
  is the page builder's design work (M5). Until then the editor counts as
  commerce composition, and the Site Engine doesn't import it. The Site
  Engine's renderer boundary is the shell plus the page body its composer
  passes in.
- **`PageKind`** is a database enum that includes commerce templates
  (`PRODUCT_TEMPLATE`, …). The Site Engine treats page kinds as opaque
  values chosen by the composition. Renaming or splitting an enum would
  only be churn.
- **One public database role** (`storevia_storefront`) with site and
  catalogue policies side by side. Splitting it into two roles would add a
  connection pool and prove nothing new: policies are already per table and
  tested per table.
- **The `@storevia/media` package** keeps its merchant services beside
  `urls`. The Site Engine imports only `@storevia/media/urls`, whose
  import graph (keys, storage adapters) the boundary test checks.
- **`currency`** in the resolved store and public context is a scalar
  setting of the store, not a commerce type. Taking it out would cost a
  query per render.

### 4. Performance budget

The fixed "< 90 kB of JavaScript on a product page" budget (06 §10) is
withdrawn: the Next.js App Router runtime alone is larger, and no
application change can meet it. It is replaced by regression controls:

- The framework baseline and the JavaScript of each route (home, product,
  collection, search, cart) are measured separately. Storevia's own
  increment is the route JS minus the baseline.
- An E2E check fails if a store page's Storevia increment grows beyond a
  small allowance, if the baseline grows materially past the recorded
  figure, or if any store page loads code from the dashboard,
  platform-admin, billing, charts, Tiptap/ProseMirror or dashboard forms.
- The unit test that allows no `"use client"` module except the required
  error boundary stays.

### 5. Public Suffix List and cookies

- Submitting `storevia.site` to the Public Suffix List is a **production
  prerequisite before a broad multi-tenant launch on
  `{merchant}.storevia.site`**. It does not block development. It is not
  submitted yet.
- Cart and preview cookies stay host-only (`__Host-` over HTTPS). Nothing
  ever sets `Domain=.storevia.site`, and a unit test fails if storefront or
  Site Engine code sets a cookie `domain`.
- Host validation (normalisation, then resolution of ACTIVE domains only)
  and the Origin check on server actions remain mandatory. Tenant isolation
  (store-scoped transactions and RLS) remains mandatory whatever the PSL
  state.

## Consequences

- A second public app (for example a client website) could reuse the
  pipeline, context, cache, invalidation, SEO, media and shell without
  pulling in commerce, and the tests say so.
- The commerce storefront code shrinks to catalogue, search, cart and
  composition. Behaviour, security properties and database policies don't
  change.
- M5 has a concrete task: split the editor into a generic document core
  and commerce components.

## Alternatives considered

- **Rename `apps/storefront` and `@storevia/commerce/storefront`.**
  Rejected as churn: names don't enforce direction, and the tests and lint
  rules do.
- **Fold the Site Engine into `@storevia/domains`.** Rejected: `domains` is
  also a merchant-side dependency (tenancy, dashboard) and should stay
  small and framework-free. The Site Engine uses Next.js and React.
- **A runtime plugin registry for commerce.** Rejected: typed imports and
  function arguments are enough, and are checked by the compiler.
