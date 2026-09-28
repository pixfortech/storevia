# 08 — Theme architecture

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**. ADR-0012.
> Milestone 5 builds the first-party theme engine (§9, ADR-0030 §7).
> Milestone 7 makes themes versioned **first-party packages** with an
> install/preview/publish/switch lifecycle and a second theme (§10). The
> file-based package format, catalogue and marketplace of §2–§6 and §8
> remain the long-term design; they are not built, and no theme code is
> ever uploaded by merchants (§10.6).

## 1. What a theme is (and is not)

A Storevia theme is a **declarative, data-only package**:

- design-token schema and defaults (colours, fonts, type scale, spacing,
  radius, shadows, container width, button styles),
- **section presets**: pre-built node subtrees made of registered components,
  with their own settings,
- **default templates**: page documents for `HOME`, `PRODUCT_TEMPLATE`,
  `COLLECTION_TEMPLATE`, `SEARCH_TEMPLATE`, `NOT_FOUND` (and starter content
  pages),
- static assets: CSS (scoped, token-driven), fonts, images, icons.

A theme **cannot** run server-side code, register new server renderers, or
ship arbitrary client JavaScript (v1). Interactive behaviour comes from
Storevia's registered components. This keeps themes safe to install, cacheable,
and compatible with a future marketplace.

Pages belong to the store, not the theme (ADR-0012). Switching theme restyles
existing pages through tokens and CSS. It does not delete or replace them.
Applying a theme's templates is a separate, explicit action that creates
**new drafts**.

## 2. Package layout

```text
my-theme/
  theme.json                 manifest
  settings/schema.json       token + setting definitions (types, defaults, groups, labels)
  settings/presets/*.json    named style presets ("Minimal", "Bold")
  sections/*.json            section presets (node subtrees + settings schema)
  blocks/*.json              reusable block presets used inside sections
  templates/*.json           default page documents per PageKind
  assets/                    css/, fonts/, images/  (content-hashed on release)
  locales/*.json             theme UI strings (e.g. "Add to cart" defaults)
  preview/                   screenshots for the theme gallery
```

## 3. Manifest (`theme.json`)

```json
{
  "$schema": "https://schemas.storevia.com/theme/1.json",
  "manifestVersion": 1,
  "key": "aurora",
  "name": "Aurora",
  "version": "1.2.0",
  "author": { "name": "Storevia", "url": "https://storevia.com" },
  "description": "Calm, editorial layout for lifestyle brands.",
  "preview": { "desktop": "preview/desktop.png", "mobile": "preview/mobile.png" },
  "engine": { "documentSchema": ">=1 <2", "components": ">=1.0" },
  "supports": ["product-templates", "collection-templates", "mega-menu"],
  "requiredFeatures": [],
  "settingsSchema": "settings/schema.json",
  "templates": { "HOME": "templates/home.json", "PRODUCT_TEMPLATE": "templates/product.json" },
  "sections": ["sections/hero-split.json", "sections/featured-collection.json"],
  "stylesheets": ["assets/css/theme.css"]
}
```

`premium_themes` entitlement gates installation of themes marked premium.
`requiredFeatures` lists entitlements the theme needs (e.g. `advanced_builder`).

## 4. Validation pipeline (on theme version upload/release)

1. Manifest and every JSON file validated against zod schemas (in
   `packages/themes`).
2. Every template and section document validated as a `PageDocument` against
   the component registry (types exist, props valid).
3. CSS parsed and checked: no `@import` from external origins, no `url()`
   outside the package or the Storevia CDN, no `expression()`/`behavior`,
   selectors scoped under the theme root class. Fonts and images checked with
   the same content sniffing as media uploads.
4. Size limits (package ≤ 20 MiB, CSS ≤ 300 KiB).
5. Package stored in object storage; SHA-256 recorded in
   `ThemeVersion.packageSha256`; assets published to the CDN under
   content-hashed paths.

## 5. Versions and immutability

- `Theme` (catalogue entry) → many `ThemeVersion` (semver).
- A `ThemeVersion` is **immutable once `RELEASED`** (DB trigger). Fixes ship
  as a new version; a broken version can be `DEPRECATED` (no new installs) or
  `REVOKED` (security: stores are migrated off it by the platform).
- A store references an exact version through `StoreTheme.themeVersionId`.

## 6. Store theme lifecycle

| Operation          | Behaviour                                                                                                                                                                  | Permission      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Install            | Create `StoreTheme(role=UNPUBLISHED)` pointing at a version; `draftSettings` = schema defaults                                                                             | `theme.publish` |
| Customise          | Edit `draftSettings` (validated against the version's settings schema; optimistic concurrency via `settingsRevision`)                                                      | `design.edit`   |
| Preview            | Signed preview token renders the storefront with this `StoreTheme` + draft settings                                                                                        | `design.edit`   |
| Publish settings   | `publishedSettings = draftSettings`, audit, cache invalidation                                                                                                             | `theme.publish` |
| Activate (go live) | Transaction: previous LIVE → UNPUBLISHED; this → LIVE (partial unique guarantees exactly one)                                                                              | `theme.publish` |
| Duplicate          | Copy row with settings (e.g. to experiment)                                                                                                                                | `design.edit`   |
| Update             | Create a new `StoreTheme` on the new version with settings carried over (unknown keys dropped, new keys defaulted), preview, then activate. The old one stays for rollback | `theme.publish` |
| Apply templates    | Creates **draft** page versions from the theme's templates for chosen page kinds, never publishing automatically                                                           | `design.edit`   |

## 7. Design tokens

Token namespaces: `color.*` (primary, secondary, accent, background, surface,
text, muted, border, success, warning, danger), `font.*` (heading, body, mono and
weights), `fontSize.*` (xs … 4xl), `space.*` (xs … 3xl), `radius.*`,
`shadow.*`, `container.width`, `button.*` (radius, padding, weight, case).

At render time, the live `publishedSettings` produce a `:root` block of CSS
custom properties (`--sv-color-primary: #…`). Node styles referencing
`{"$token": "color.primary"}` compile to `var(--sv-color-primary)`. A global
colour change is therefore one settings publish, with no page rewrites.

Contrast checks: the customiser warns when text/background token pairs fall
below WCAG AA.

## 8. Future marketplace compatibility

- Third-party themes use the same package format; `Theme.origin = MARKETPLACE`. Review = the automated validation above plus a human review.
- No executable code in themes means a malicious theme can at worst produce
  ugly CSS or misleading content, which review and revocation handle.
- If theme JavaScript is ever allowed, it will run in a sandbox with a
  capability API, under a separate ADR.

## 9. The theme engine (as built in Milestone 5)

Code: `packages/site-engine/src/theme.ts` (pure, client-safe; tests in
`theme.test.ts`). Since M7 the engine is `theme-core.ts`, the packages are
in `themes/` and `theme.ts` is the registry (§10).

- **One first-party theme** (`storevia`) with three presets: **Editorial**
  (the default, and the M4 look: serif headings, stone palette),
  **Minimal** and **Modern**.
- **Settings** (`themeSettingsSchema`, strict, every value bounded):

  | Setting                   | Values                                                                                                                |
  | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
  | `preset`                  | editorial, minimal, modern                                                                                            |
  | `colors`                  | background, text, primary, accent: `#rrggbb` only                                                                     |
  | `headingFont`, `bodyFont` | system stacks: system sans, humanist, geometric, system serif, old style, transitional, monospace (no font downloads) |
  | `buttonStyle`             | solid, outline, pill                                                                                                  |
  | `radius`                  | none, small, medium, large                                                                                            |
  | `contentWidth`            | narrow, standard, wide                                                                                                |
  | `sectionSpacing`          | compact, standard, spacious                                                                                           |

- **Contrast rules** (WCAG): text on background at least 4.5:1; the brand
  colour at least 3:1 against the background (4.5:1 for outline buttons,
  whose text is the brand colour); accent at least 3:1. Text on the brand
  colour is derived (white or near-black, whichever reaches 4.5:1), and the
  muted colour is the most muted mix that keeps 4.5:1. Settings that fail
  can't be saved; stored settings that no longer validate fall back to the
  preset on the site.
- **Tokens:** `resolveTheme` produces the §7 token set, now including
  `space.section`, `radius.button`, `button.*` and `container.narrow`;
  `themeCss` writes only known tokens with validated values. There is no
  merchant CSS.
- **Storage:** `StoreTheme` with `themeKey` (instead of `themeVersionId`
  until M7), `draftSettings`, `publishedSettings`, `settingsRevision`, one
  LIVE row per store (partial unique index). The storefront role can't read
  `draftSettings`: `app_storefront_theme_settings()` returns the published
  settings, or the draft ones only in a verified preview.
- **Lifecycle:** Customise (`design.edit`, revision-checked draft) →
  Preview (signed store preview) → Publish (`theme.publish`). A publish
  emits `theme.changed` through the outbox, which refreshes the store's
  `design:{storeId}` cache tag.

## 10. Theme packages (as built in Milestone 7)

Themes are **versioned first-party packages**: TypeScript modules in this
repository, reviewed and tested like the rest of the code. A merchant
installs, customises, previews, publishes and switches between them; a
merchant never supplies theme code (§10.6).

Code: engine `packages/site-engine/src/theme-core.ts`; packages
`packages/site-engine/src/themes/{storevia,boutique}.ts`; registry and
rendering `packages/site-engine/src/theme.ts` (`THEMES`,
`renderableTheme`); chrome `packages/site-engine/src/chrome.tsx`
(`SiteChrome`); demo content `packages/site-engine/src/demo.ts`; services
`packages/site-admin/src/theme.ts`; dashboard Themes area `/s/{store}/themes`
(`components/themes/`, §10.7); migration `20270101000000_theme_packages`.

### 10.1 The package contract (`ThemeDefinition`)

| Field                           | Meaning                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                           | Stable id stored in `StoreTheme.themeKey` (`^[a-z][a-z0-9-]{1,40}$`)                                                                                                                            |
| `version`                       | Integer release of the package. Raised when its presets or settings change shape (with `migrateSettings`)                                                                                       |
| `name`, `description`, `author` | Library metadata; `author` is always `"Storevia"`                                                                                                                                               |
| `compatibility`                 | `engine`: the `THEME_ENGINE_VERSION`s it was built for (tokens, settings fields, chrome slots, block class names); `documentSchema`: the page-document `schemaVersion`s it renders              |
| `presets`, `defaultPreset`      | Its own named styles; the default preset is its default settings                                                                                                                                |
| `settingsSchema`                | Its allowed settings: its preset keys plus the shared bounded fields and contrast rules of §9 (`themeSettingsSchemaFor`)                                                                        |
| `chrome`                        | Renderer capabilities: `header` (inline / centred), `navigation` (plain / uppercase), `footer` (inline / centred), `productCard` (square / portrait), `productPage` (split / gallery)           |
| `stylesheet`                    | First-party CSS appended after the shared block styles, every selector scoped under `[data-sv-theme="<key>"]`, driven by the tokens; no `@import`, `url()` or markup (checked by `defineTheme`) |
| `migrateSettings`               | Optional: upgrades settings saved for an older version before they are validated                                                                                                                |

`defineTheme` refuses a definition that breaks the contract (bad key,
presets failing their own schema or the contrast rules, unsafe CSS), so a
broken theme fails at build and test time, not in a store.

### 10.2 The themes

- **Storevia** (v1, the default): name, menu and actions on one row, square
  product cards, a two-column product page; presets Editorial (default),
  Minimal, Modern. No stylesheet of its own: it is the shared block styles.
- **Boutique** (v1): the store's name centred above an uppercase,
  letter-spaced menu row; centred footer; tall 3:4 product cards with
  centred serif titles; a wide product gallery beside a sticky details
  column (one column on phones); square corners, uppercase buttons,
  lighter headings. Presets Atelier (default), Linen, Gallery; every preset
  meets the §9 contrast rules (unit-tested). It is chrome markup from the
  Site Engine's shell plus its scoped stylesheet, so every registered
  block, every page kind, the cart and checkout render with it unchanged;
  page documents and commerce data never know which theme is on.

### 10.3 Versions and compatibility

- `StoreTheme.themeVersion` records the package version the settings were
  saved for. A **column**, not a key inside the settings: settings are a
  strict, merchant-shaped schema that the version must be read _before_
  parsing, it gets a CHECK (`>= 1`), and it can be queried (which stores
  still hold settings from an older version). Save and publish write the
  current version.
- Reading settings (`themeSettingsFor`): settings from an older version go
  through the theme's `migrateSettings`, then everything is validated with
  the theme's own schema; anything unusable becomes the theme's default
  preset. It never throws, so a store never renders broken.
- `THEME_PLATFORM` (`@storevia/editor/theme`) is this build's
  `{ engine: THEME_ENGINE_VERSION, documentSchema: DOCUMENT_SCHEMA_VERSION }`.
  Installing, previewing or publishing a theme whose `compatibility`
  doesn't include it is refused (`CONFLICT` with a plain explanation), and
  the library shows why. A test in `@storevia/editor` fails if the
  document schema moves on without every theme declaring support.
- Rendering (`renderableTheme`): an unknown or removed theme key, or a live
  theme that is no longer compatible, renders the **default theme**
  (keeping the stored settings only if they are valid for it) and is
  logged; invalid settings render the theme's defaults.

### 10.4 Lifecycle

| Operation   | Behaviour                                                                                                                                                                                                                       | Permission      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Install     | An `UNPUBLISHED` row with the theme's default preset and version (installing again returns it). First records the store's implicit live default theme as a row, so switching back always works                                  | `design.edit`   |
| Customise   | Draft settings of one installed theme, validated with that theme's schema, `UPDATE … WHERE settingsRevision = base`                                                                                                             | `design.edit`   |
| Preview     | Sets that row's `previewedAt`; the signed store preview renders the most recently chosen installed theme with its draft settings, and its banner says the theme isn't published                                                 | `design.edit`   |
| Publish     | Revision-checked; draft re-validated (migrated from its version) and made `publishedSettings`. For a theme that isn't live, one transaction demotes the LIVE row to `UNPUBLISHED` (its settings kept) and makes this one `LIVE` | `theme.publish` |
| Switch back | Publishing the previous theme again (**Make live** on its library card)                                                                                                                                                         | `theme.publish` |

- **Concurrency.** Every theme write takes a per-store advisory lock
  (`lockStoreKey(store, "theme")`); the partial unique index still allows
  only one LIVE row, and `(storeId, themeKey)` is unique, so concurrent
  installs create one row and concurrent publishes leave exactly one LIVE
  theme (integration-tested).
- **Preview isolation.** `app_storefront_theme_settings()` returns
  `(theme_key, theme_version, live, settings)`: outside a verified preview
  always the LIVE row's published settings; only with `app.preview = 'on'`
  may it return an `UNPUBLISHED` row's draft. The storefront role still
  sees only LIVE rows in the table itself. A switch clears every
  `previewedAt`, so the preview follows the new live theme.
- **Invalidation.** A switch changes `role` on two rows, a publish changes
  `publishedSettings`, and a new version on the LIVE row changes
  `themeVersion`: each emits `theme.changed` (the `design:{storeId}` tag).
  Installs, draft edits and preview choices change nothing public and emit
  nothing.
- **Nothing else moves.** Pages, page versions, products, collections,
  carts, orders, domains and URLs are untouched by every theme operation.
- **Audit.** `theme.installed`, `theme.draft_saved`,
  `theme.preview_chosen`, `theme.published`, `theme.switched` (with
  `theme`, `previousTheme`, `themeVersion`, `preset`).

### 10.5 Rendering

The storefront layout reads the theme row in its chrome query
(`storeChrome`, cached under `design:{storeId}`, uncached in a preview),
resolves it with `renderableTheme(row, THEME_PLATFORM)` and passes the
definition to `SiteShell`, which sets `data-sv-theme` on `<html>`, renders
the definition's header and footer variant through `SiteChrome` (the header
carries `data-sv-header="inline|centred"`), and appends its stylesheet
after the composition's CSS. The builder canvas uses the live theme's
tokens but not its chrome stylesheet (the canvas has no header or footer);
blocks there show the shared styles.

### 10.6 Why no merchant-uploaded theme code

- **Safety.** A theme's stylesheet and chrome run on every page of a store,
  next to checkout. First-party code is reviewed, tested (contrast,
  scoping, no `@import`/`url()`) and shipped with the platform; uploaded
  CSS could exfiltrate data through selectors and `url()`, overlay
  checkout, or break accessibility, and uploaded code could do far worse.
- **Compatibility.** Versioning against the engine contract and the
  document schema only works when the platform can test every theme
  before release; a merchant theme would break silently on an upgrade.
- **Scope.** Merchants get real choice through bounded settings and
  first-party themes. A marketplace (§2–§5, §8) would need package
  validation, review and revocation first; it stays deferred and would get
  its own ADR.

### 10.7 Themes area and demo previews

Themes are their own merchant area, next to Website (which keeps pages,
menus and the builder). Only presentation and routes moved: the services,
permissions and theme engine are the ones above.

| Route                                     | What it shows                                                                                                         | Permission                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `/s/{store}/themes`                       | Current theme (name, style, state, actions), then the theme library with a live miniature of each theme               | `design.edit`                               |
| `/s/{store}/themes/customise[?theme=key]` | The customiser for the live theme or another installed theme                                                          | `design.edit` (publishing: `theme.publish`) |
| `/s/{store}/themes/demo/{theme}`          | The full demo: home or product page, Desktop · Tablet · Mobile, any of the theme's styles (`?page=&viewport=&style=`) | `design.edit`                               |
| `/s/{store}/website/theme[?theme=key]`    | Redirects to `/themes` (or `/themes/customise?theme=key`), so old links keep working                                  | (checked by the target)                     |

The navigation lists **Themes** right after **Website**, for exactly the
members who see Website (same permission, same plan lock;
`lib/areas/themes-area.ts`), grouped under the Website heading.

**Library cards.** Each card has a miniature, name and version, state
badges written out as text (**Live**, **Installed**, **Previewing**,
**Unpublished changes**, **Not installed**), the layout in words, and five
actions in a fixed order (`lib/theme-card.ts`): **View demo** · **Install**
/ **Installed** · **Customise** · **Preview on my store** · **Publish**
(live theme with changes) / **Make live**. An action that doesn't apply
yet stays in its place, disabled, so the rows line up across cards; they
are equal-width buttons in a two-column grid that stacks on phones.

**Demo content.** `THEME_DEMO` (`@storevia/site-engine/demo`) is a fixed,
frozen demo store owned by Storevia: brand, announcement, menus, hero, a
collection title and four products with INR prices (one on sale), and a
featured product with variants. It never contains a merchant's data, images
or external URLs; product images are placeholder blocks tinted from the
theme's tokens (`THEME_DEMO_CSS`, scoped under `.sv-demo`). The Site Engine
knows no commerce, so the dashboard composes the content into two page
documents (`lib/theme-demo.ts`): a home page (hero + featured products) and
the storefront's own product template plus "You may also like", with the
catalogue views the blocks read. Both documents validate against the
Storevia registry (unit-tested).

**Rendering.** A preview is the renderer's output, never a hand-drawn
imitation or a stored screenshot: `ThemeDemoDocument`
(`components/themes/theme-demo.tsx`) renders the theme package's chrome
(`SiteChrome`), the page document with `STOREVIA_REGISTRY` and
`RenderDocument`, and a stylesheet built by `themeDemo(theme, css, preset)`
in the storefront's order: the preset's tokens, `SITE_BASE_CSS`, the
composition's block CSS, the demo placeholders, then the theme's own
stylesheet. The demo root carries the theme's identity as data
(`data-sv-theme`, `data-sv-product-card`, `data-sv-product-page`,
`data-sv-navigation`, `data-sv-footer`, `data-sv-preset`, `data-sv-demo`);
the header carries `data-sv-header` from the renderer. Tests compare these
and measured layout (card aspect ratio, product-page columns), not pixels.

**Isolation.** Theme stylesheets are scoped under `[data-sv-theme]`, but
the base rules (`:root` tokens, `body`, headings, links) are document-wide,
so a preview can't be inlined into the dashboard. `ThemeDemoFrame` draws it
in a same-origin `srcdoc` iframe, as the builder canvas does, and React
renders into the frame's body through a portal. The dashboard's CSS never
reaches the demo and the demo's never reaches the dashboard; the frame is
laid out at the viewport's real width (1280, 768 or 390 px, so the theme's
media queries apply) and scaled down with a CSS transform to fit.
Navigation inside a frame is cancelled. No extra route serves demo HTML,
so the dashboard's CSP (`frame-ancestors 'none'`, nonce scripts, no
third-party origins) is unchanged: a `srcdoc` frame inherits it, runs no
script of its own and loads nothing. Library miniatures are `inert`
(neither focusable nor announced); the card's text describes the theme.
