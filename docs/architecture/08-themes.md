# 08 — Theme architecture

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**. ADR-0012.

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
