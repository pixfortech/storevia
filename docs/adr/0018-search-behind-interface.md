# ADR-0018: Search behind an interface, PostgreSQL first

- Status: Accepted
- Date: 2026-09-24

## Decision

- `SearchIndex` interface (`index`, `remove`, `query` with mandatory store
  scope, facets later).
- First implementation: PostgreSQL full-text search (`tsvector` generated
  columns + GIN, language configuration per store locale) plus `pg_trgm` for
  fuzzy matching of SKUs and titles.
- No Elasticsearch/OpenSearch/Typesense until measured relevance or latency
  needs justify it. A swap then means implementing the interface and a
  reindex job.

## Consequences

- No extra infrastructure at launch; tenant filtering enforced inside the
  implementation.
- Postgres FTS has weaker relevance tuning and multilingual support. That is
  acceptable for launch.
