# ADR-0011: Page builder canonical format is a versioned JSON document tree

- Status: Proposed
- Date: 2026-09-24

## Decision

- Pages are stored as `PageDocument` JSON (nested nodes with `id`, `type`,
  `props`, `styles`, `responsive`, `visibility`, `children`) in
  `PageVersion.document`. Raw HTML is never the canonical format.
- Every document has `schemaVersion`. Pure migration functions upgrade old
  documents.
- Components come from a registry (definition includes schema, defaults,
  allowed children, renderer, editor controls, entitlement).
- Styling is a closed, token-aware vocabulary. There is no free-form CSS.
- Rich text is stored as Tiptap/ProseMirror JSON.
- Server-side validation and size/depth limits on every save.
- Editing happens on a DRAFT version; publishing atomically swaps
  `Page.publishedVersionId`; published versions are immutable.

Details: `docs/architecture/07-page-builder-document.md`.

## Consequences

- Safe (no stored XSS/CSS injection), portable (re-render for new themes,
  AMP, email, native), migratable.
- Everything a merchant can express must be modelled explicitly. That is
  the intended constraint.
