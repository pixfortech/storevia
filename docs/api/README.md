# Storevia Admin API — conventions (v1, draft)

> Milestone 0 deliverable. The API itself ships incrementally from Milestone 3.
> Architecture and scopes: [10-api-webhooks-apps.md](../architecture/10-api-webhooks-apps.md).

## Base URL and versioning

`https://api.storevia.com/api/v1`. Breaking changes require a new major path
version. Additive changes (new fields, endpoints, enum values documented as
open) may ship within v1, so clients must ignore unknown fields.

## Authentication

`Authorization: Bearer sv_live_…` (store-bound API key) or an OAuth access
token (future apps). Cookies are ignored. Missing/invalid → `401`; valid but
missing scope or entitlement → `403`.

## Identifiers

Public IDs are TypeIDs: `<prefix>_<26-char base32 UUIDv7>`.

| Prefix                   | Resource                            |
| ------------------------ | ----------------------------------- |
| `org`                    | Organisation                        |
| `store`                  | Store                               |
| `prod` / `var` / `opt`   | Product / Variant / Option          |
| `coll`                   | Collection                          |
| `media`                  | Media asset                         |
| `loc` / `invitem`        | Location / Inventory item           |
| `cus`                    | Customer                            |
| `ord` / `ordline`        | Order / Order line                  |
| `pay` / `ref` / `ful`    | Payment / Refund / Fulfilment       |
| `disc`                   | Discount                            |
| `page` / `pagever`       | Page / Page version                 |
| `whep` / `whdel` / `evt` | Webhook endpoint / delivery / event |

An ID with the wrong prefix for the endpoint is a `400`, not a lookup.

## Request and response shape

- JSON, UTF-8, `camelCase` fields.
- Money: `{ "amount": "99950", "currency": "INR" }` (amount is a string of
  minor units).
- Timestamps: ISO-8601 UTC (`2026-09-24T10:15:30.123Z`).
- Countries/currencies/locales: ISO-3166-1 alpha-2 / ISO-4217 / BCP-47.

## Pagination

Cursor-based: `?limit=50&cursor=<opaque>`; `limit` ≤ 250 (default 50).
Response:

```json
{ "data": [ … ], "pageInfo": { "hasNextPage": true, "endCursor": "eyJ…" } }
```

## Errors

[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details:

```json
{
  "type": "https://docs.storevia.com/errors/limit-reached",
  "title": "Plan limit reached",
  "status": 403,
  "code": "LIMIT_REACHED",
  "detail": "This store has reached its product limit.",
  "requestId": "req_01j9…",
  "errors": [{ "path": "title", "code": "too_small", "message": "…" }]
}
```

Stable machine codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION_FAILED`, `CONFLICT`, `ENTITLEMENT_REQUIRED`, `LIMIT_REACHED`,
`RATE_LIMITED`, `IDEMPOTENCY_CONFLICT`, `PRICE_CHANGED`, `INTERNAL`.
Internal details (stack traces, SQL, provider errors) are never returned;
`requestId` links to server logs.

Resources in other stores are `404`, the same as missing resources.

## Idempotency

`Idempotency-Key: <uuid>` on POST/PATCH/DELETE. The first response is stored
for 24 h and replayed for the same key and body. The same key with a
different body is `422 IDEMPOTENCY_CONFLICT`.

## Rate limiting

Token bucket per API key and per store. Headers: `RateLimit-Limit`,
`RateLimit-Remaining`, `RateLimit-Reset`; `429` + `Retry-After` when
exceeded.

## Webhook verification (receiver side)

```text
signed_payload = timestamp + "." + raw_body
expected = hex(HMAC_SHA256(endpoint_secret, signed_payload))
valid if any v1 in Storevia-Signature equals expected (constant-time compare)
and |now - timestamp| <= 300 s
```
