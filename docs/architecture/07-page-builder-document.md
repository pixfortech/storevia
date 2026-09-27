# 07 — Visual builder: document architecture

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**. ADR-0011.
> Milestone 5 builds a structured **section builder** on this format
> (ADR-0030); §10 describes what is built, and which baseline items are
> deferred.
>
> The page document is the most long-lived data format in Storevia. Every
> published site depends on it forever, so it is designed conservatively:
> structured, versioned, validated, and never raw HTML.

## 1. Principles

1. **Canonical format is structured JSON**, a tree of typed nodes. HTML is
   only ever a render output.
2. **Versioned**: every document carries `schemaVersion`; old versions are
   upgraded by pure, tested migration functions.
3. **Validated on every write**, server-side, against the envelope schema and
   each component's property schema.
4. **Constrained styling**: a design-token-aware style vocabulary, not
   arbitrary CSS.
5. **Editor state ≠ published content.** The editor edits a `DRAFT`
   `PageVersion`; the storefront reads only the version referenced by
   `Page.publishedVersionId`.

## 2. Document shape

```ts
interface PageDocument {
  schemaVersion: 1;
  root: BuilderNode[]; // top-level sections
  meta?: { background?: StyleValue<Color> };
}

interface BuilderNode {
  id: string; // 12-char URL-safe random ID, unique within the document
  type: string; // registered component type, e.g. "section", "heading"
  name?: string; // label shown in the layers panel
  props: Record<string, JsonValue>; // validated by the component's propertySchema
  styles: StyleSet; // base (desktop) styles
  responsive?: {
    // desktop-first overrides
    tablet?: ResponsiveOverride; // ≤ 1024 px
    mobile?: ResponsiveOverride; // ≤ 640 px
  };
  visibility?: { desktop?: boolean; tablet?: boolean; mobile?: boolean }; // default visible
  locked?: boolean; // editor-only: prevents selection/move
  hidden?: boolean; // editor + render: not rendered
  children?: BuilderNode[]; // only if the component allows children
}

interface ResponsiveOverride {
  styles?: Partial<StyleSet>;
  props?: Record<string, JsonValue>;
}

// A style value is either a token reference or a constrained literal.
type StyleValue<T> = { $token: string } | T; // e.g. { "$token": "color.primary" } or "#1a1a1a"
```

Example:

```json
{
  "schemaVersion": 1,
  "root": [
    {
      "id": "h3Xk9pQ2mZ1a",
      "type": "hero",
      "props": {
        "heading": "Handmade ceramics",
        "subheading": {
          "type": "doc",
          "content": [
            {
              "type": "paragraph",
              "content": [{ "type": "text", "text": "Small batches, fired in Jaipur." }]
            }
          ]
        },
        "image": { "mediaId": "media_01j9zq…", "alt": "Bowls on a shelf" },
        "cta": { "label": "Shop now", "link": { "type": "collection", "id": "coll_01j9…" } }
      },
      "styles": {
        "paddingBlock": { "$token": "space.2xl" },
        "background": { "$token": "color.surface" }
      },
      "responsive": { "mobile": { "styles": { "paddingBlock": { "$token": "space.lg" } } } },
      "children": []
    },
    {
      "id": "pG7wq0Lr4sTe",
      "type": "product-grid",
      "props": { "source": { "type": "collection", "id": "coll_01j9…" }, "limit": 8, "columns": 4 },
      "styles": {},
      "responsive": { "mobile": { "props": { "columns": 2 } } }
    }
  ]
}
```

### Why nested, not a flat node map

The canonical form is a nested tree (easy to read, validate, diff and
render). The editor normalises it into a flat `Map<id, node>` plus parent and
child indexes for O(1) operations, and serialises back to the tree on save. The
stable node IDs mean a future real-time collaboration layer (CRDT) can be
added on top without changing the stored format.

## 3. Links and data references

Links and data sources are **typed references**, never URLs built by the
client:

```ts
type LinkTarget =
  | { type: "url"; href: string } // http(s), mailto, tel only; validated
  | { type: "page" | "product" | "collection"; id: TypeId }
  | { type: "home" | "search" | "cart" };
type DataSource =
  | { type: "collection"; id: TypeId }
  | { type: "products"; ids: TypeId[] }
  | { type: "current-product" } // PRODUCT_TEMPLATE pages only
  | { type: "current-collection" }; // COLLECTION_TEMPLATE pages only
```

References are resolved at render time. On publish, the server checks that
every referenced ID belongs to **the same store** and exists. Dangling
references are reported as publish warnings and render as nothing.

## 4. Style vocabulary

`StyleSet` is a closed set of properties with validated value types:

| Group      | Properties                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout     | `display` (block/flex/grid/none), `direction`, `wrap`, `justify`, `align`, `gap`, `columns`, `columnSpan`, `width`, `maxWidth`, `minHeight`, `aspectRatio` |
| Spacing    | `paddingBlock`, `paddingInline`, `marginBlock`, `marginInline` (and per-side variants)                                                                     |
| Typography | `fontFamily` (token), `fontSize` (token or rem), `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `textTransform`, `color`                        |
| Background | `background` (colour token/hex, or media reference + fit/position)                                                                                         |
| Border     | `borderWidth`, `borderStyle`, `borderColor`, `radius`                                                                                                      |
| Effects    | `shadow` (token), `opacity`                                                                                                                                |

- Lengths are restricted to `px`, `rem`, `%`, `vh`/`vw` within bounds.
  Colours are hex/rgb/hsl or tokens. There is no free-form CSS string
  anywhere, which eliminates CSS injection and keeps output predictable.
- Tokens reference the store's live theme settings (`color.primary`,
  `font.heading`, `space.lg`, `radius.md`, `shadow.sm`, `container.width`)
  ([08-themes.md](./08-themes.md)). Changing a token restyles every page.
- The style compiler turns a node's styles into a scoped class
  (`.n-{id}`) with media queries for the tablet/mobile overrides. On publish
  the compiled CSS can be stored alongside the version as a render artefact.

## 5. Component registry

Components are registered, not hard-coded into the editor or renderer:

```ts
interface ComponentDefinition<P extends JsonObject> {
  type: string; // "heading"
  label: MessageKey; // i18n key
  icon: IconName;
  category: "layout" | "basic" | "media" | "commerce" | "forms" | "marketing" | "advanced";
  defaultProps: P;
  propertySchema: z.ZodType<P>; // server + client validation
  styleSchema?: StyleCapabilities; // which style groups are editable
  allowedChildren: "none" | "any" | readonly string[];
  allowedParents?: readonly string[]; // e.g. "column" only inside "columns"
  allowedPageKinds?: readonly PageKind[]; // e.g. "add-to-cart" only on PRODUCT_TEMPLATE
  dataRequirements?: (props: P, ctx) => DataRequest[]; // collected before render (§ storefront)
  entitlement?: FeatureKey; // e.g. "custom_code", "advanced_builder"
  renderer: ServerRenderer<P>; // React Server Component, used by storefront and canvas
  editorControls: PropertyControl[]; // declarative: text, richtext, media, link, select, toggle, number, product/collection picker
  migrations?: Record<number, (oldProps: JsonObject) => JsonObject>;
}
```

- Renderers are shared by the storefront and the editor canvas, so what the
  merchant sees is what shoppers get.
- `editorControls` are declarative descriptors. The editor UI renders them, so
  adding a component needs no editor changes.
- Initial components (base set in M4, the rest in M5): Section, Container, Columns/Column, Grid,
  Heading, Text, RichText, Image, Video, Button, Icon, Divider, Spacer, Hero,
  Banner, AnnouncementBar, Logo, Navigation, Product, ProductCard,
  ProductGrid, CollectionGrid, Price, AddToCart, Cart, Form, Newsletter,
  Testimonials, FAQ, CustomHTML (restricted, §8).
- Entitlement-gated components (`advanced_builder`, `custom_code`) are
  checked on **save and publish**, not only hidden in the palette.

## 6. Rich text

Rich-text props store **Tiptap/ProseMirror JSON**, never HTML. The allowed
node and mark set is fixed (paragraph, heading 2–4, lists, blockquote, bold,
italic, underline, strike, code, link, hard break). The storefront renders it
server-side with an allow-list renderer. Link `href`s pass the same URL
validation as `LinkTarget.url`.

## 7. Validation, limits and schema evolution

- **On every save (autosave included)**, the server validates the envelope,
  then each node: type registered, props valid against `propertySchema`,
  children allowed, IDs unique, references well-formed.
- Hard limits: ≤ 2 000 nodes, depth ≤ 12, serialised size ≤ 1 MiB, ≤ 200
  data bindings per page. Payloads over the limit are rejected with a clear
  error.
- **Schema versions:** `migrations[n]` converts a v*n* document to v*n+1*.
  Migrations are pure functions with fixture tests (old document in, expected
  document out). `DRAFT` documents are upgraded and re-saved when the
  editor opens them. `PUBLISHED` and `ARCHIVED` documents are immutable
  (trigger), so they are **only upgraded in memory on read** and never
  rewritten. Every migration step therefore stays in the codebase as long as
  any stored version uses it. Renderers only need to understand the latest
  version.
- Per-component `migrations` handle prop-shape changes for one component
  without bumping the whole document version.
- At render time an unknown component type is skipped (and logged), so a bad
  deploy or rollback degrades a section instead of taking down the site.

## 8. CustomHTML and code

- **Default (all plans):** `CustomHTML` content is sanitised server-side on
  save with a strict allow-list (no `script`, `style` attributes filtered,
  no event handlers, `javascript:` URLs removed, iframes only from an
  allow-listed embed list such as YouTube/Vimeo/Maps).
- **With `custom_code` entitlement:** raw embeds render inside a sandboxed
  iframe (`sandbox="allow-scripts allow-popups"` without
  `allow-same-origin`) whose `src` is served from a **separate origin**
  (`https://embed.storeviausercontent.com/{embedId}`) with its own
  restrictive CSP header. `srcdoc` is not used, because a `srcdoc` document
  inherits the storefront's CSP, which would block the embed's scripts. The
  code gets an opaque origin and can't touch the storefront DOM, cookies or
  cart.
- No server-side execution of merchant code, and no `eval`, ever. Full custom
  JavaScript would need its own ADR and security review.

## 9. Drafts, autosave and publishing

| Operation   | Behaviour                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open editor | Loads the page's `DRAFT` version, creating one from the published version if none exists                                                                                                                                                                                                                                                                |
| Autosave    | Debounced (≈1.5 s idle, max every 10 s) `saveDraft(pageId, baseRevision, document)`; the server validates, checks `revision = baseRevision` (optimistic concurrency) and increments it. A conflict returns `409`, and the editor shows who else saved and offers reload or copy                                                                         |
| Manual save | Same call, immediate                                                                                                                                                                                                                                                                                                                                    |
| Publish     | Transaction: validate + reference check → lock page row → previous published version becomes `ARCHIVED` **first** (partial unique indexes can't be deferred) → draft becomes `PUBLISHED` (document frozen by trigger) → `Page.publishedVersionId` = draft → audit + outbox `page.published` (cache invalidation). Next edit creates a new draft from it |
| Unpublish   | `publishedVersionId = NULL`, version → `ARCHIVED`; storefront shows 404 (home page cannot be unpublished)                                                                                                                                                                                                                                               |
| History     | Archived versions listed with author and timestamp; retention: last 50 versions + all from the last 90 days                                                                                                                                                                                                                                             |
| Restore     | Copies an archived version's document into the current draft (`basedOnVersionId` set). Publishing stays a separate, explicit step                                                                                                                                                                                                                       |

A crashed browser, a failed autosave or a half-applied operation can only
affect the draft. The published version is immutable and swapped atomically.

## 10. Editor application (as built in Milestone 5)

ADR-0030 narrows M5 to a controlled section editor. The document format is
v1, unchanged: a page's top-level nodes are its **sections**, and the
builder edits sections, not arbitrary trees.

### Packages

| Package                                   | Holds                                                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@storevia/editor` (generic, no commerce) | Document schema and validation, section operations, the registry builder, eleven generic section blocks, the renderer, rich text, navigation menus. Client-safe                                    |
| `@storevia/commerce/blocks`               | Commerce link kinds (product, collection, search, cart), data sources, commerce blocks (featured products, collection list, the M4 product/collection/search/cart components), `STOREVIA_REGISTRY` |
| `@storevia/commerce/site`                 | `STOREVIA_SITE`: the composition (registry, templates, reference checker) the services take as an argument                                                                                         |
| `@storevia/site-admin`                    | Merchant services: pages, drafts, publish, theme, menus, with RBAC and `withTenant`                                                                                                                |
| `apps/dashboard` `components/site/`       | Builder, canvas, settings forms, pickers, theme and menu editors                                                                                                                                   |

ESLint and `packages/site-engine/src/boundary.test.ts` keep `@storevia/editor`
free of commerce, database, media and UI imports, and keep commerce blocks
client-safe.

### Registry

`createRegistry({ linkKinds, components })` builds a registry at compile
time. A component is a definition or a factory over a schema kit whose
`link` schema accepts exactly the registry's link kinds, so a Site Engine
registry (`SITE_REGISTRY`: url, home, page) refuses a product link that the
Storevia registry accepts. A section definition declares `section: true`,
a `headingProp` (the first section's heading is the page's `h1`), bounded
`controls` for the settings panel, data requirements, and
`requires: ["catalogue"]` for commerce sections. There is no runtime
registration, plugin loading or public SDK.

Generic sections: hero, text, image, image with text, gallery, features,
call to action, FAQ (`<details>`), testimonials, logo strip, contact
details. Commerce sections: featured products (latest, a collection, or
chosen products) and collection list. New sections start empty and render
nothing until the merchant writes content: no invented testimonials,
clients or figures.

### Operations

Pure functions in `@storevia/editor/document` (`operations.ts`), unit
tested without React: `createSection`, `insertSection`, `moveSection`,
`duplicateSection` (fresh ids for the copy and its subtree),
`removeSection`, `updateSectionProps`, `setSectionHidden`,
`setSectionVisibility` (per device: desktop, tablet, phone). Each returns a
new document or throws `OperationError` (unknown section, limit reached).

### Limits (M5)

| Limit                    | Value                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Sections per page        | 40 (on top of 2 000 nodes, depth 12, 1 MiB)                                           |
| Items per block          | 24 gallery or logos, 12 features or testimonials, 30 FAQ, 24 collections, 48 products |
| Standard pages per store | 100                                                                                   |
| Menu items               | 20 per menu, labels up to 80 characters                                               |
| Text fields              | Bounded per field by each block's schema                                              |

### Builder

- Route: `/s/{storeId}/website/pages/{pageId}`. The Website hub
  (`/website`), pages list (`/pages`), theme (`/website/theme`) and menus
  (`/website/navigation`) sit beside it.
- Three panels on desktop (sections, canvas, settings); tabs on phones and
  tablets.
- Sections are added from a dialog, reordered with **Move up / Move down**
  buttons (keyboard-accessible, no drag needed), duplicated, hidden, shown
  per device and removed. Settings forms are generated from the block's
  controls: text, rich text, media (from the library, with upload), links
  (only the registry's kinds), select, toggle, number, items, products and
  collections by search.
- **Canvas:** a same-origin `srcdoc` iframe into which React renders the
  working document through a portal, with the storefront's registry, base
  styles and theme tokens, at 1280, 768 or 390 px scaled to fit. Data comes
  from the storefront resolver run in the merchant's transaction
  (`loadCanvasData`, preview policy). Clicks select sections; links, buttons
  and forms don't navigate or submit.
- **Saving:** autosave 1.5 s after the last change, one request in flight,
  plus Save draft. Every save sends the draft's `revision`. A stale revision
  is refused (`CONFLICT`) and the builder stops autosaving and says _"This
  page changed somewhere else"_, with Reload. Nothing is overwritten.
- **Preview** opens the signed storefront preview for the page's path
  (`/` or `/pages/{handle}`; any other `path` falls back to `/`).
- **Publish** (`page.publish`) is one transaction: lock, re-validate,
  re-check references, archive the previous version, publish the draft, move
  the pointer. The outbox emits `page.changed`.

### Deferred from the baseline

Freeform tree editing and dnd-kit, layers, undo/redo, inline text editing,
per-breakpoint styles, CustomHTML and embeds (§8), version history and
restore (§9: archived versions are kept, but there is no UI yet), keyboard
shortcuts, nested menus.
