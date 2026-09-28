# ADR-0030: Site presentation: structured builder, theme engine and navigation (Milestone 5)

- Status: Accepted
- Date: 2026-09-27
- Refines: ADR-0011 (page documents), ADR-0012 (pages and themes),
  ADR-0028 (storefront engine), ADR-0029 (Site Engine and commerce
  composition)

## Context

Milestone 5 turns the Site Engine's M4 rendering path into a presentation
system that merchants control: pages composed of structured sections, draft
and publish, preview, a theme with bounded settings, and navigation. Storevia
stays an ecommerce SaaS. ADR-0029 left one concrete task for M5: split the
editor into a generic document core and commerce components. This ADR
records an audit of what exists, then the decisions.

## Audit of the M5 foundation (HEAD 82e7649)

**1. What page/editor code exists.**

| Where                                                   | What                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/editor/src/document`                          | `PageDocument` v1 (a nested tree of typed nodes with props, a closed style vocabulary, responsive overrides, visibility), limits (2 000 nodes, depth 12, 1 MiB, 200 bindings), `validateDocument`, `upgradeDocument` (v1 only), typed references (links, data sources, media), `collectRefs` |
| `packages/editor/src/registry`                          | `ComponentDefinition` (type, props schema, defaults, allowed children/parents/page kinds, data requirements, CSS variables, entitlement, declarative editor controls, server renderer); 17 components: layout, basic, `hero`, and five commerce ones                                         |
| `packages/editor/src/render`                            | `RenderDocument`, one-walk `collectRequirements`, scoped CSS compiler, base CSS, rich-text renderer, product card/price/image parts                                                                                                                                                          |
| `packages/editor/src/templates`                         | code-only default documents per page kind (HOME, product, collection, search, 404)                                                                                                                                                                                                           |
| `packages/site-engine/src/theme.ts`                     | design tokens, the one built-in theme, `themeCss`                                                                                                                                                                                                                                            |
| `packages/site-engine/src/read.ts`                      | `SiteReader`: published page by kind/handle, page links, public media views, page sitemap                                                                                                                                                                                                    |
| `packages/site-engine/src/shell.tsx`                    | branded shell with `nav`/`actions` slots                                                                                                                                                                                                                                                     |
| `apps/storefront` routes, `route-data.ts`, `chrome.tsx` | load the published page of a kind (falling back to the code default), resolve its requirements in one transaction, render; header navigation = the store's collections                                                                                                                       |
| database                                                | `Page`, `PageVersion` (one draft, one published, frozen non-draft documents, deferred published-pointer trigger, `revision` for optimistic concurrency, 1 MiB CHECK), RLS, storefront policy (PUBLISHED only), outbox trigger `page.changed`                                                 |
| RBAC                                                    | `design.edit`, `page.publish`, `theme.publish`, `navigation.manage` already defined and assigned to roles                                                                                                                                                                                    |

There are no page services, no merchant UI, no theme or navigation storage,
and no code that writes a `Page` row. The M4 "system presentation" is the
code default HOME document, the default theme, and collections as
navigation.

**2. What is generic.** The document envelope, node validation, limits,
style vocabulary and CSS compiler; layout and basic components; media
references; page links; the rich-text format and renderer; the design tokens;
`SiteReader`; the shell.

**3. What is commerce-coupled.** The editor imports
`@storevia/commerce/rich-text`; `LinkTarget` and `DataSource` name
products, collections, search and cart; `RenderContext` carries product
lists, the current product/collection/search, currency, the add-to-cart slot
and variant URLs; five commerce components and money formatting live in
the same registry; the default templates reference catalogue data.

**4. What moves or splits.** Rich text moves into the editor (commerce
re-exports it). Commerce components, commerce link kinds, the commerce
render context, price parts and the page templates that use catalogue data
move to `@storevia/commerce/blocks`. `RenderContext` splits into a generic
`SiteRenderContext` and commerce's extension. The route-data composition
that resolves a document's needs moves from the app into
`@storevia/commerce/storefront`, so the storefront and the builder canvas
use one resolver.

**5. How blocks register without cycles.** Link targets become a
registered set of kinds. The editor defines `url`, `home` and `page`;
commerce adds `product`, `collection`, `search` and `cart`. Components that
take links are factories over a schema kit, so a registry's zod schemas
accept exactly its registered link kinds. Commerce builds the Storevia
registry from the generic definitions plus its own. Direction:
`apps → commerce/blocks → editor → site-engine/theme`; nothing points back.

**6. What renderer is replaced.** The routes keep their boundary
(`StorePage` → `RenderDocument`); what changes is what they render: the
store's real HOME page (backfilled), section blocks, the store's theme
instead of `DEFAULT_THEME`, and its navigation instead of the collection
list. The code default templates remain only as the fallback for an
unusable stored document and for template kinds nobody edits yet.

**7. What stays untouched.** Hostname and domain resolution, the signed
public context, access state, canonical redirects, RLS for existing tables,
media delivery, catalogue and search read models, cart, the cache and the
signed invalidation protocol, product and collection URLs.

## Decision

### 1. Scope: a structured section builder

M5 builds a **controlled section editor**, not a freeform canvas. The
document format stays v1 unchanged. A page's top-level nodes are its
**sections**. The builder adds, configures, reorders, duplicates, hides and
removes sections of registered **section blocks**, whose settings are their
props. There is no pixel positioning, no free CSS and no per-breakpoint
styling. Top-level nodes of other types (M4 layout trees) render as before
and can be moved or removed, not edited.

The roadmap's freeform items (dnd-kit tree editing, layers, undo/redo,
inline text editing, per-breakpoint styles, CustomHTML/embeds, history
and restore) are deferred. Sections reorder with Move up/Move down buttons,
which also serve keyboard users.

### 2. Editor split

- `@storevia/editor` is generic and imports no commerce module: document,
  operations, registry, generic blocks, renderer, rich text
  (`@storevia/editor/rich-text`, which `@storevia/commerce/rich-text`
  re-exports), navigation schema. It may import
  `@storevia/site-engine/theme` and `@storevia/types`.
- `@storevia/commerce/blocks` holds commerce link kinds, the commerce render
  context, commerce blocks and templates, and `STOREVIA_REGISTRY` (generic
  plus commerce).
- The generic `SITE_REGISTRY` renders a page with zero commerce blocks and
  zero commerce imports. A test proves it, and the import-graph boundary
  test now covers `@storevia/editor` as well as the Site Engine.

### 3. Registry

A registry is built at compile time from link kinds and component
definitions (or factories over the schema kit). A definition declares type,
label, category, props schema, defaults, controls for the settings panel,
data requirements, capabilities (`requires: ["catalogue"]`, entitlement)
and a server renderer. There is no dynamic loading, no third-party
registration and no public SDK.

### 4. Blocks

Generic section blocks: hero, text, image, image with text, gallery,
features, call to action, FAQ (`<details>`, no JavaScript), testimonials,
logo strip, contact details. Commerce section blocks: featured products
(catalogue, collection or chosen products) and collection list. Carousels
are left out because they need client code. Every block renders on the
server with no client JavaScript.

Blocks share bounded presentation settings: background (default, surface,
accent) and spacing (compact, standard, spacious), plus block-specific
alignment, width, columns, image position and aspect. The first section's
heading is the page's `h1`; later ones are `h2`, and items are `h3`. New
blocks start empty and render nothing until the merchant writes content, so
there are no invented testimonials or claims.

### 5. Draft and publish

Services live in a new package, `@storevia/site-admin`, which covers the
merchant side of the Site Engine: pages, themes and navigation, run with
`withTenant` and RBAC. They take the registry and a reference checker as
arguments, and the composition supplies both (commerce adds product and
collection checks). The rules follow 07 §9:

- **Open.** Loads the draft, or creates one copied from the published
  version.
- **Save.** Validates, checks references (media READY in this store, pages,
  products and collections of this store), then runs
  `UPDATE … WHERE revision = base`. A stale revision raises `CONFLICT` and
  nothing is overwritten. `documentHash` is computed by PostgreSQL over
  `jsonb::text`.
- **Publish.** Needs `page.publish`. One transaction: lock the page, then
  revalidate and re-check references, archive the old published version,
  publish the draft, and move the pointer. The existing triggers keep
  published documents immutable and the pointer consistent. The outbox
  trigger emits `page.changed`.
- **Pages.** Create, rename, SEO, handle and delete apply to standard
  pages. HOME can't be deleted or unpublished.

### 6. Preview

The signed store preview (15 minutes, store-bound, `noindex`,
`private, no-store`) now renders draft page versions and draft theme
settings. The storefront role may read `DRAFT` page versions only when the
transaction sets `app.preview = 'on'`, which the Site Engine does only for a
verified preview context. Preview reads bypass the shared page cache. The
builder's live canvas is a same-origin iframe in the dashboard. It renders
the working document with the same registry, theme CSS and resolver, reading
through the merchant's tenant-scoped transaction. There is no second token
mechanism.

### 7. Theme engine

- `ThemeDefinition` is code-defined and first-party. It has presets
  (Minimal, Editorial, Modern) and a settings schema.
- Merchant settings are colours (hex), heading and body fonts from an
  allow-list of system stacks (no font downloads), button style, corner
  radius, content width and section spacing. They are validated, bounded
  and checked for contrast: text on background is at least 4.5:1, and the
  text colour on primary buttons is derived.
- The resolved theme becomes the existing design tokens and `themeCss`, so
  no merchant CSS exists anywhere.
- Storage is the draft schema's `StoreTheme` (draft and published settings,
  `settingsRevision`, one LIVE per store). Until packaged themes arrive
  (M7), it has `themeKey` instead of `themeVersionId`. Publishing needs
  `theme.publish`.
- **M7 amendment (2027-01, migration `20270101000000_theme_packages`).**
  Themes became versioned first-party packages, still code in this
  repository (`packages/site-engine/src/themes/`), never uploaded: each
  `ThemeDefinition` carries `version`, `compatibility` (theme-engine
  contract and page-document schema versions), metadata, presets, its own
  settings schema, chrome metadata (header, menu, footer, product card and
  product page variants) and a scoped first-party stylesheet. A second
  theme, **Boutique**, ships beside Storevia. A store installs a theme as
  an `UNPUBLISHED` row (`design.edit`), customises and previews it, and
  publishing it (`theme.publish`) moves the one LIVE row atomically, the
  previous theme keeping its settings. `StoreTheme` gains `themeVersion`
  (settings migrate on read), `previewedAt` (which installed theme the
  signed preview shows) and one row per theme per store. `themeVersionId`
  and the `Theme`/`ThemeVersion` catalogue stay deferred to a marketplace.
  Details: 08-themes.md §10.

### 8. Navigation

`Navigation` (handles `main` and `footer`) stores its items as a validated
JSON array of `{ id, label, link }`, using the same typed link targets as
documents, with a `revision`. This replaces the draft's `NavigationItem`
rows: one link model everywhere, atomic reordering, optimistic concurrency.
Links that no longer resolve (a deleted page, an archived collection)
render as nothing. Menus are flat in M5 (at most 20 items). Editing needs
`navigation.manage`; changes are live immediately, like Shopify menus.

### 9. HOME pages and existing stores

A migration gives every store without a HOME page one, with a published
starter document. The same SQL function runs from an `AFTER INSERT`
trigger on `Store`, so every store always has one. The starter content is
truthful:

- Ecommerce: a hero with the store's name, a collection list, and featured
  products from the catalogue. Blocks with no data render nothing.
- Other business types: a hero with the store's name only.

The migration is deterministic (fixed node ids), idempotent
(`NOT EXISTS`) and tenant-safe (organisation and store taken from the store
row). Existing storefronts render the same catalogue content as before.

### 10. Invalidation

Theme and navigation changes emit `theme.changed` and `navigation.changed`
through outbox triggers. They map to a new store-scoped Site Engine tag,
`design:{storeId}`, which every page and chrome entry carries. This is not
the `store:` tag, which also flushes resolved hosts. The worker and the
signed revalidation route are unchanged.

### 11. Limits

- 40 sections per page (on top of the 2 000-node limit).
- Items: 24 per gallery or logo strip, 12 per features or testimonials, 30
  per FAQ, 24 collections per collection list, 48 featured products.
- Text length is bounded per field.
- 20 navigation items per menu, 80-character labels.
- 100 standard pages per store.

Documents stay at most 1 MiB (CHECK). Numbers are enforced by the schemas
and documented in 07.

### 12. Permissions

- `design.edit`: open the builder, save drafts, create pages, edit theme
  drafts, preview; from M7 also install a theme and choose which installed
  theme the preview shows.
- `page.publish`: publish, unpublish and delete pages.
- `theme.publish`: publish the theme; from M7 also switch to another
  installed theme.
- `navigation.manage`: navigation.

Every check is on the server. The UI only hides what the server would
refuse.

## Consequences

- Merchants get real pages, a real theme and navigation. The storefront
  renders them through the M4 boundary with no new client JavaScript.
- The Site Engine (engine and editor) is reusable by a non-commerce site.
  Commerce composes in through one registry and one resolver.
- `PageDocument` v1 stays compatible. M4 documents validate and render
  unchanged.
- Deferred: freeform canvas and layers, undo/redo, inline editing,
  per-breakpoint styling, CustomHTML/embeds, page history and restore,
  nested menus, packaged themes and a theme gallery (M7: first-party theme
  packages and the theme library shipped; see §7), web fonts,
  handle-change redirects.

## Alternatives considered

- **A new document format `{ sections[] }`.** Rejected. v1 already
  expresses sections as top-level nodes, and a new format would need a
  migration of stored documents for no gain.
- **An iframe of the public storefront as the builder canvas.** Rejected.
  Preview cookies are host-only and `SameSite=Lax`, so they aren't sent to a
  cross-site iframe, and loosening that would weaken preview security.
- **`NavigationItem` rows with foreign keys to products and collections.**
  Rejected. It would put commerce columns into Site Engine storage and
  duplicate the link model.
- **Packaged themes now (`Theme`/`ThemeVersion`).** Deferred to M7. M5
  needs quality presets, not a package format.
