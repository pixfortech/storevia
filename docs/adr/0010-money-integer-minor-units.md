# ADR-0010: Money as integer minor units with explicit currency

- Status: Proposed
- Date: 2026-09-24

## Decision

- Amounts are `bigint` minor units in TypeScript and `BIGINT` in PostgreSQL,
  always paired with an ISO-4217 currency code. Never floats. `Decimal` is not
  used for money either.
- Currency exponents come from a table (0, 2 or 3 decimals). Nothing assumes 2.
- Percentages in basis points; tax rates in parts per million.
- Centralised pure money library (`packages/commerce/money`) with explicit
  rounding and largest-remainder allocation.
- JSON carries amounts as strings.

## Consequences

- Exact arithmetic; no silent currency mixing (throws).
- `bigint` needs care at JSON boundaries. Serialisers handle it centrally.

## Alternatives considered

`INT` (overflows at ~21M major units in 2-decimal currencies); `NUMERIC` +
decimal.js (slower, easy to misuse, still needs currency-aware rounding).
