# ADR-0017: Centralised validation with zod

- Status: Accepted
- Date: 2026-09-24

## Decision

- All external input (server actions, API bodies/queries, webhooks after
  signature verification, env vars, page documents, theme manifests, job
  payloads) is parsed with **zod 4** schemas from `packages/validation` (or
  the owning domain package for domain-specific schemas).
- The same schemas drive client-side form validation and OpenAPI generation.
- Parsing is at the boundary. Domain functions receive already-typed values.

## Consequences

- One definition per contract; no drift between client and server.
- Schema changes are contract changes and are reviewed as such.
