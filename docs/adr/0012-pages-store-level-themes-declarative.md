# ADR-0012: Pages belong to the store; themes are declarative packages

- Status: Accepted
- Date: 2026-09-24

## Context

A visual builder (Wix/Webflow-style) and a theme system (Shopify-style) both
want to own the storefront layout. If pages belong to themes, switching theme
loses merchant work. If themes can run code, marketplace safety is hard.

## Decision

- `Page` and `PageVersion` belong to the **store**. Special kinds
  (`HOME`, `PRODUCT_TEMPLATE`, `COLLECTION_TEMPLATE`, `SEARCH_TEMPLATE`,
  `NOT_FOUND`) are pages too.
- A theme provides **design tokens + settings schema, section/block presets,
  default templates and static assets**. It contains no server code and (v1)
  no custom JavaScript.
- Switching themes restyles pages through tokens and CSS. Applying a theme's
  templates creates new drafts explicitly.
- `ThemeVersion` is immutable once released; `StoreTheme` pins an exact
  version.

Details: `docs/architecture/08-themes.md`.

## Consequences

- Merchant content survives theme changes; themes are safe to host and
  review.
- Themes are less "powerful" than code-based theme systems. Extensibility
  comes through registered components instead.
