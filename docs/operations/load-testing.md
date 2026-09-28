# Load testing and performance budgets

> M8 deliverable (performance/load). How to seed many stores, drive a
> production build of the storefront across all of them, what one process
> measured, and the budgets derived from those measurements. The per-page
> query budgets are enforced in CI by
> `packages/commerce/tests/query-scaling.int.test.ts`; the latency budgets
> are checked by rerunning this procedure (below) before a release that
> touches the storefront's read path, and on staging before launch.

## 1. What is here

| Piece            | Where                                               | What it does                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-store seed | `apps/dashboard/scripts/seed-load.ts` (`seed:load`) | Organisations, live stores, catalogues, published themes, shipping, tax, test payments, real orders, customer messages, open carts and custom domains, all through the real services. Writes a manifest |
| Database wrapper | `scripts/load/with-database.mjs`                    | Runs a command with every `DATABASE_*_URL` (not the admin URL) pointed at another database. Refuses `storevia` and `*_test`                                                                             |
| Load driver      | `scripts/load/run.mjs` (`pnpm load`)                | Node `http`/`https` only, no dependencies. Spreads requests round-robin over every store in the manifest with each store's `Host`; reports per scenario and total; writes JSON                          |
| N+1 guard        | `packages/commerce/tests/query-scaling.int.test.ts` | Storefront pages and dashboard lists cost the same number of queries for a small store and a store with 8× the data among other populated stores (M4-09 harness, `countQueries`)                        |

## 2. Seeding (local only)

The seed refuses to run unless `STOREVIA_ENV` is `development` or `test`.
Use a database of its own, never `storevia` (development) or
`storevia_test` (integration tests and E2E truncate it):

```sh
# Once: create, migrate and load plans into storevia_load.
cd packages/database && STOREVIA_TEST_DATABASE=storevia_load pnpm tsx scripts/reset.ts --target=test && cd ../..

# Seed (about 40 s for the defaults; a rerun converges in about 3 s).
LOG_LEVEL=warn node scripts/load/with-database.mjs storevia_load \
  pnpm --filter @storevia/dashboard seed:load
```

Sizes come from the environment: `LOAD_ORGS` (10), `LOAD_STORES_PER_ORG`
(2; more than 3 puts the organisations on Enterprise), `LOAD_PRODUCTS` (40
per store), `LOAD_ORDERS` (8 per store), `LOAD_CONCURRENCY` (4
organisations seeded at once), `LOAD_MANIFEST`
(`.storevia/load-manifest.json`). Optional: `MEDIA_LOCAL_DIR` keeps the
seeded images out of the dashboard's `.media/`; `DOMAIN_PROVIDER_LOCAL_STATE`
defaults to `.storevia/load-domains.json` so the domain simulator's state
is not the one development and E2E share.

Per store (slug `load-{org}-{n}`): products with tags, vendors and images
(every fifth has Colour × Size, four variants, stock set with
`setInventory`, one variant sold out); collections "All goods", "Kitchen"
and "New in"; the default theme saved and published, or Boutique
installed and published on every other store; India shipping, 18% GST
(prices include tax); the Test Payment Provider; orders placed through
cart → checkout → test payment (every third shopper returns); messages
from the first two shoppers; the storefront live. Every third
organisation's first store gets an ACTIVE custom domain
(`www.{slug}.test`) through the local provider, and on every sixth it is
primary, so its platform address redirects there. Each run also opens
two fresh carts per store for the driver (a cart token can't be read
back; only its hash is stored).

The manifest lists every store's slug, the host to request, a spread of
product handles, the collection handles, the cart tokens and the data
volume.

## 3. Running the driver

Start the built storefront against the same database. Use a port of your
own; `STOREFRONT_ROOT_DOMAIN` must carry it:

```sh
pnpm --filter @storevia/storefront build   # if not built
cd apps/storefront
STOREVIA_ENV=test NODE_ENV=production STOREFRONT_ROOT_DOMAIN=store.localhost:3912 LOG_LEVEL=warn \
  node ../../scripts/load/with-database.mjs storevia_load npx next start --port 3912
```

(`next start` warns that the app is built with `output: standalone`; it
serves the same build.) Then, from the repository root:

```sh
pnpm load --port 3912 --concurrency 1,10,50 --duration 30 --warmup 5 \
  --db-url postgresql://postgres:…@localhost:5432/storevia_load
```

Scenarios (`--scenarios`, default all but search): `home` (`/`),
`collection` (`/collections/{handle}`), `product` (`/products/{handle}`),
`cart` (`/cart` with an open cart's cookie) and `health`
(`/api/health`). `search` exists but is rate limited per store (3,000 a
minute) and per client. Scenarios interleave, and each scenario rotates
through every store first, so all stores see traffic in every second of
the run. Any response that isn't 2xx (a redirect, a 404 for an unknown
host, a 5xx, a timeout) counts as an error, and the exit status is 1 if
any request failed. `--db-url` (needs `psql`) adds database work per
request from `pg_stat_database` deltas; results are written to
`--out` (`.storevia/load-results.json`), with the machine description.

Stop the storefront when done.

## 4. Measured results (2026-09-28)

**Machine:** one Linux VM, 4 vCPU (Intel Xeon @ 2.10 GHz), 15.7 GiB RAM,
Node 24.21, PostgreSQL 16.13 on the same host, the driver on the same
host. Storefront: the production build of `apps/storefront` (Next.js
16.3.6) under `next start`, one process, `STOREVIA_ENV=test`,
`NODE_ENV=production`, default pool (10 connections per role).

**Data:** 10 organisations, 20 live stores (4 with an active custom
domain, 2 of them primary), 800 products, 1,280 variants, 60 collections,
160 orders from 120 customers, 40 customer messages, 30 StoreTheme rows,
about 280 carts (160 of them checked out). The driver requested 20 home
pages, 60 collection pages, 160 product pages and 40 carts.

Two passes on a freshly started server, 5 s warm-up then 30 s measured
at each concurrency. Pass 2 (quiet host) is shown; pass 1 differed by
under 10% (the host was busier with unrelated work in its last minute).
Latency in milliseconds.

| Concurrency | Scenario   | Requests | req/s | p50   | p95   | p99   | Errors |
| ----------- | ---------- | -------- | ----- | ----- | ----- | ----- | ------ |
| 1           | home       | 730      | 24.3  | 7.0   | 11.3  | 16.2  | 0      |
| 1           | collection | 729      | 24.3  | 8.0   | 14.8  | 18.3  | 0      |
| 1           | product    | 729      | 24.3  | 6.6   | 18.7  | 24.3  | 0      |
| 1           | cart       | 729      | 24.3  | 13.0  | 18.8  | 24.6  | 0      |
| 1           | health     | 729      | 24.3  | 2.1   | 3.1   | 4.0   | 0      |
| 1           | **total**  | 3,646    | 121.5 | 7.2   | 16.5  | 21.9  | 0      |
| 10          | home       | 864      | 28.8  | 57.6  | 79.6  | 94.7  | 0      |
| 10          | collection | 864      | 28.8  | 59.4  | 83.5  | 97.0  | 0      |
| 10          | product    | 864      | 28.8  | 57.5  | 81.2  | 94.7  | 0      |
| 10          | cart       | 864      | 28.8  | 156.7 | 192.9 | 206.4 | 0      |
| 10          | health     | 863      | 28.7  | 8.7   | 17.5  | 25.4  | 0      |
| 10          | **total**  | 4,319    | 143.8 | 58.2  | 168.7 | 192.9 | 0      |
| 50          | home       | 889      | 29.5  | 266.3 | 435.7 | 498.1 | 0      |
| 50          | collection | 889      | 29.5  | 266.1 | 444.0 | 518.5 | 0      |
| 50          | product    | 889      | 29.5  | 266.5 | 447.0 | 508.7 | 0      |
| 50          | cart       | 888      | 29.4  | 827.8 | 1,060 | 1,108 | 0      |
| 50          | health     | 888      | 29.4  | 43.7  | 92.8  | 122.6 | 0      |
| 50          | **total**  | 4,443    | 147.2 | 266.3 | 977.6 | 1,060 | 0      |

Pass 1 totals: 119.6 / 134.7 / 135.8 req/s; p95 16.3 / 180.7 / 1,019.5 ms
at concurrency 1 / 10 / 50; no errors.

**One scenario at a time**, concurrency 10, 10 s (the capacity of one
process for that page alone): home 152 req/s (p95 87 ms), collection 125
(105), product 158 (91), cart 97 (133), health 660 (26).

**Where the time goes.** The storefront process was CPU-bound on one core
(100–125% CPU, RSS 450–720 MB) from concurrency 1 upwards: about 7 ms of
rendering per page. The database was not the limit. Throughput is flat
from 10 to 50 concurrent requests and latency grows with the queue, with
no errors or timeouts: overload degrades by queueing only.

**Database side** (`pg_stat_database` deltas; `pg_stat_statements` isn't
loaded locally, so statements aren't counted directly): 0.4–0.5
transactions per request for this mix, about 40 rows returned and 65
buffer hits per request under load, no disk reads, no writes. Home,
collection and product pages served from the in-process route cache do no
database work once warm; the cart page did two transactions (the header
count and the page each read the whole cart). The host cache (30 s) and
the invalidation feed (one read a second per process) add the rest.

**Fixed after this measurement:** the header count and the cart page now
share one cart read per request (`requestCart` in
`apps/storefront/src/lib/cart.ts`, React's per-request `cache`). Measured
on the same data and machine, home + cart mix, 20 s per step:

| Concurrency | Cart p95 before → after | Transactions per request (mix) | Total req/s   |
| ----------- | ----------------------- | ------------------------------ | ------------- |
| 1           | 22.0 → 18.0 ms          | 1.1 → 0.6                      | 83.9 → 91.4   |
| 10          | 162.7 → 139.4 ms        | 1.1 → 0.5                      | 108.3 → 124.4 |

The cart page alone went from 2.2 to 1.2 transactions per request. The
tables above were measured before the fix; the budgets below still hold
with it.

**Cold pages.** The first view of each page after a start (the warm-up at
concurrency 1, which loads every route's data once) measured p50 16 ms,
p95 41–43 ms, max 65 ms.

## 5. Budgets

Derived from the numbers above with explicit headroom (about 1.5× the worse
of the two passes, so ordinary noise doesn't fail them while a real
regression does). They are per storefront process on hardware like the
above; rerun the procedure on the same kind of machine to compare.

| Budget                                          | Limit                          | Measured          | Headroom |
| ----------------------------------------------- | ------------------------------ | ----------------- | -------- |
| Errors (non-2xx, timeouts) at concurrency 1–50  | **0**                          | 0                 | none     |
| p95 home, collection, product at concurrency 1  | ≤ 30 ms                        | 11.3–18.7 ms      | 1.6×     |
| p95 cart at concurrency 1                       | ≤ 30 ms                        | 18.7–18.8 ms      | 1.6×     |
| p95 home, collection, product at concurrency 10 | ≤ 130 ms                       | 79.6–86.6 ms      | 1.5×     |
| p95 cart at concurrency 10                      | ≤ 300 ms                       | 192.9–205.4 ms    | 1.5×     |
| p95 health at concurrency 10                    | ≤ 30 ms                        | 17.5–18.6 ms      | 1.6×     |
| Throughput, this mix, concurrency 10            | ≥ 100 req/s                    | 134.7–143.8 req/s | −25%     |
| p99 at concurrency 50 (overload, all scenarios) | ≤ 2,000 ms, no errors          | 1,060–1,196 ms    | 1.7×     |
| Database transactions per request, this mix     | ≤ 0.5 (warm pages: 0)          | 0.4–0.5           | at limit |
| Queries per page and per dashboard list         | constant in store size (below) | constant          | —        |

Query budgets (enforced in CI by `query-scaling.int.test.ts`, which also
checks that a small store and a store with 8× the products, 3× the
variants, 6× the collections, 8× the menu links, 20× the cart lines and
8× the orders, among four other populated stores, cost exactly the same):

| Read                               | Queries measured | Ceiling |
| ---------------------------------- | ---------------- | ------- |
| Storefront home (route data)       | 3                | 4       |
| Storefront product page            | 2                | 3       |
| Storefront collection page         | 3                | 4       |
| Store chrome (theme, menus, links) | 3                | 4       |
| Cart page (header count + cart)    | 2 (was 4)        | 3       |
| Dashboard products list            | 5                | 6       |
| Dashboard product editor           | 14               | 16      |
| Dashboard orders list              | 2                | 3       |
| Dashboard order detail             | 17               | 20      |
| Dashboard customers list           | 1                | 2       |

The older per-page tests (`storefront.int.test.ts`, `site.int.test.ts`,
`cart-stock.int.test.ts`, `checkout.int.test.ts`,
`taxonomy.int.test.ts`) keep their own budgets; this test adds growth in
the store and in the number of stores. Raising a ceiling is a decision
recorded here, not a fix-up.

## 6. What these numbers do not show

- **One machine.** Driver, storefront and PostgreSQL shared four vCPUs;
  there was no network between them. Neon adds a network round trip to
  every query and a pooler (pgbouncer) in front; cached pages are
  unaffected, the cart page and every cold page are not.
- **No CDN, no TLS, no images.** Requests went straight to the Node
  process over plain HTTP; `_next/static` assets and media were not
  requested. Production puts Vercel's edge in front.
- **Vercel is not one long-lived process.** Functions scale out, start
  cold, and each instance has its own route and host caches, so hit rates
  per instance are lower at low traffic, and the invalidation feed is read
  by every instance. The single-process throughput here is a unit of
  capacity, not the platform's capacity.
- **Warm caches dominate.** Home, collection and product pages were served
  from the in-process route cache after their first view. The cold path
  was only sampled in warm-ups (p95 about 42 ms at concurrency 1).
- **Shoppers with a cart cost more than modelled.** Only the cart scenario
  sends a cart cookie. A real shopper with a cart sends it on every page,
  and the header's item count reads the whole cart (one read per
  request), so each such page view does a database transaction the driver
  never measured on home, collection or product pages. A cheaper count
  query for the badge is a possible follow-up.
- **Not covered:** checkout and payments under load (writes, stock
  reservations, rate limits), search (rate limited), the dashboard and
  platform-admin under load, the worker's queue drain, and connection-pool
  pressure across many instances. These are follow-ups.

## 7. Rerunning against staging

Never against production: the seed refuses any stage but development and
test, and the driver refuses the production root domain
(`storevia.site`). On staging:

1. Don't run the seed. Create a handful of **synthetic** stores through the
   product itself (signup and the dashboard, or platform-admin with a
   staff plan), on test-mode payments, named so they are obviously
   synthetic, with a few products and collections each. Never include a
   merchant's store.
2. Write a manifest by hand in the seed's format (the driver reads only
   these fields; hosts are `{slug}.{rootDomain}`, or `host` when it equals
   `customDomain`):

   ```json
   {
     "rootDomain": "staging.storevia.site",
     "stores": [
       {
         "slug": "synthetic-load-1",
         "host": "synthetic-load-1.staging.storevia.site",
         "customDomain": null,
         "productHandles": ["…"],
         "collectionHandles": ["…"],
         "cartTokens": []
       }
     ]
   }
   ```

   With no cart tokens the cart scenario shows an empty cart; leave `cart`
   out of `--scenarios`, or add to a cart from a browser and copy its
   token.

3. Run the driver over HTTPS against the stores' own hosts, gently, and
   tell whoever watches staging alerts first:

   ```sh
   pnpm load --protocol https --manifest staging-manifest.json \
     --scenarios home,collection,product,health --concurrency 1,10 --duration 30 --warmup 5
   ```

   Vercel's firewall or the per-client rate limits may answer with 429s,
   which count as errors.

4. Compare with section 5 knowing what differs (section 6): network to
   Neon, cold functions, several instances. Record the results next to
   the table above rather than replacing it.
