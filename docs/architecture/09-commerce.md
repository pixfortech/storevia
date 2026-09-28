# 09 — Commerce domain

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**. ADR-0010.
>
> Implemented in `packages/commerce` (M3, M6) and `packages/payments` (M6).
> This document fixes the rules that must hold from the first line of code.
>
> **Milestone 3 status:** money (§1), the catalogue (§2) and inventory are
> implemented as decided in
> [ADR-0027](../adr/0027-commerce-catalogue-and-inventory.md), which records
> the refinements (archive instead of delete, the reconciliation of option
> edits, `product_limit` and `media_storage` as gauges, the single inventory
> write path). Everything from carts onwards is Milestone 6.
>
> **Milestone 6 status:** carts through refunds are implemented as decided in
> [ADR-0031](../adr/0031-checkout-orders-payments.md). Where the baseline
> below differs, the ADR and the summary in §11 win.
>
> **Product taxonomy and tags** (migration `20261210000000_product_taxonomy`,
> after Milestone 6): the global category taxonomy deferred by ADR-0027 and
> ADR-0031 §14, and the tag policy, are in §2.1.

## 1. Money

- Amounts are **integer minor units** (`bigint` in TypeScript, `BIGINT` in
  PostgreSQL). Example: ₹999.50 → `99950n` paise.
- A money value **always carries its currency**:
  `type Money = { readonly amount: bigint; readonly currency: CurrencyCode }`.
- Currency exponents come from an ISO-4217 table, never an assumed 2:
  JPY/KRW = 0, INR/USD/EUR = 2, BHD/KWD/JOD/OMR/TND = 3.
- `packages/commerce/money` (pure, no dependencies) provides: `money()`,
  `add`, `subtract`, `multiply(money, integerQuantity)`,
  `applyBasisPoints(money, bps, rounding)`, `applyPpm(money, ppm, rounding)`,
  `allocate(money, ratios)` (largest-remainder, so the parts always sum to the
  total), `compare`, `isZero`, `format(money, locale)` (via `Intl`), and
  `parseDecimal(string, currency)` for user input.
- Operations on mismatched currencies **throw**. There is no implicit
  conversion.
- Rounding mode is explicit per call (half-even for tax by default,
  configurable per tax jurisdiction; half-up for display conversions).
- JSON/API representation: `{ "amount": "99950", "currency": "INR" }`, with
  the amount as a **string** so JavaScript clients never lose precision.
- Property tests (fast-check): allocation sums, associativity of add,
  round-trip parse/format per currency.

## 2. Catalogue rules

- Product → options (≤ 3) → option values; product → variants (≥ 1). Each
  variant has exactly one value per option; the `optionSignature` prevents
  duplicate combinations.
- Price, compare-at price, cost, SKU, barcode, weight, taxability and
  inventory policy live on the **variant**.
- Product status `DRAFT | ACTIVE | ARCHIVED`. Only `ACTIVE`, non-deleted
  products are visible on the storefront (and `publishedAt ≤ now`).
- Creating a product consumes `product_limit` usage in the same transaction.

### 2.1 Categories, collections, product types and tags

Four ways to group products, each with one job. They are never merged or
derived from each other.

| Concept          | Owner               | Where                                         | Shape                                                                   | Used for                                                                                                                        |
| ---------------- | ------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Category**     | Storevia (platform) | `Product.categoryCode` → `ProductCategory`    | One per product, from a shared hierarchical taxonomy; codes never shown | What the product _is_, the same way in every store: admin filters, the public breadcrumb; later tax rules and marketplace feeds |
| **Collection**   | The merchant        | `Collection` + `CollectionProduct` (ADR-0027) | Many per product, curated and ordered, with a handle and a page         | Storefront merchandising and navigation ("Summer edit", "Kitchen")                                                              |
| **Product type** | The merchant        | `Product.productType`                         | One free-text label per product                                         | The merchant's own classification; a list filter; shown on the product page if a theme wants                                    |
| **Tags**         | The merchant        | `Product.tags` (`text[]`)                     | Many short labels per product                                           | Finding and bulk-editing products in the dashboard. **Not** storefront navigation: no tag pages, no tag URLs                    |

**Tags.** One policy, `packages/validation/src/tags.ts`, applied by every
write path (editor, create, bulk add/remove) through `tagsSchema`, and
reused by the editor's chips to preview:

- NFC-normalised; control characters become spaces, invisible formatting
  characters (zero-width spaces, bidi overrides, BOM) are removed;
  whitespace trimmed and collapsed. A comma always separates tags.
- HTML-looking text is kept as plain text and only ever rendered as text
  (React escapes it); nothing is stripped or interpreted.
- De-duplicated ignoring case, keeping the first spelling
  (`"Summer, summer"` → `["Summer"]`). Case is otherwise preserved.
- At most **50 tags of at most 40 characters** (the same bounds as customer
  tags). More, or longer, is a `tags` field error, never a silent cut.
- The database enforces the resulting shape: `CHECK
catalogue_tags_valid(tags)` (count, length, trimmed, no control
  characters or commas), so no other writer can store anything else.

Suggestions (`listProductTags`) are the distinct tags of the **same
store's** live products (`unnest(tags)`, grouped ignoring case, most used
spelling, most used first, case-insensitive prefix, at most 50), filtered by
`storeId` inside the store's RLS scope. The admin list filters by
`?tag=` ignoring case through a GIN index over
`catalogue_tags_folded(tags)` (the lower-cased array); rows show up to three
tags, and the filter offers the store's 100 most used.

**Categories.** `ProductCategory` is platform reference data, like the plan
catalogue: no tenant columns, no row-level security, `SELECT` for
`storevia_app` and `storevia_storefront` only, no write privilege for any
application role. Rows carry `code` (stable slug, primary key), `name`,
`parentCode`, `level`, `path` (`"Home & Garden > Kitchen & Dining >
Cookware"`), `position` and `active`. `Product.categoryCode` references it
with `ON DELETE RESTRICT`: categories are deactivated, never deleted, so a
delete only happens by mistake and should fail loudly rather than strip
merchants' products (`SET NULL`). A product may have no category.

- `listProductCategories(ctx, { q?, parentCode?, limit? })` searches active
  categories by the words of their breadcrumb (trigram index on
  `lower(path)`), or lists one level of the tree; `getCategoryPath(ctx, code)`
  returns a breadcrumb. Both are bounded.
- Product create/update accept `categoryCode`: an active code, or `""` to
  clear. Unknown, retired or malformed codes are a `categoryCode` field
  error. The category is only validated when it changes, so saving other
  fields never fails on a category the taxonomy has since retired (the
  editor says so and offers another). Changes are audited
  (`fields: "category"`, `category`, `previousCategory`) and go through the
  store-scoped `inStore` + RLS path like every product write.
- The editor's picker (a dialog) browses the tree level by level or
  searches it, and shows breadcrumbs (`Home & Garden › Kitchen & Dining ›
Cookware`); merchants never see codes. The admin list filters by
  `?category=` (the category and everything under it, via a recursive query
  on `ProductCategory(parentCode)` and the `(categoryCode, storeId)` index),
  offering the categories the store uses and their ancestors.
- The public product DTO carries `category: { name, path }`, `tags` and
  `productType`, never the code.

**The reference data.** `packages/database/prisma/reference/product-categories.json`
lists `{ code, name, parent? }` in taxonomy order. `pnpm db:seed` (also run
by `pnpm db:reset` and `pnpm db:test:prepare`, so every development, test,
CI and E2E database has it) loads it with
`packages/database/scripts/product-categories.ts`: it checks the file
(unique well-formed codes, known parents, no cycles, no `>` in names),
derives `level` and `path`, upserts one tree level per statement and
deactivates codes that left the file. Rerunning it is a no-op. The starter
set covers a dozen top-level branches and the sample catalogue (cookware,
drinkware, kitchen linens, planters, tote bags…).

To change it: add codes rather than renaming them (a code is a stable
identifier; a merchant's product keeps pointing at it); rename a category by
changing its `name` (paths of its descendants follow); retire one by
removing it from the file (it is deactivated; products keep it until the
merchant picks another). Then run `pnpm db:seed` in each environment.

To import a full taxonomy later (for example Shopify's MIT-licensed
[Standard Product Taxonomy](https://github.com/Shopify/product-taxonomy),
about 11 000 categories, or Google's product taxonomy): convert its
distribution file to the same `{ code, name, parent }` list, keeping the
starter codes (map them to the imported categories they correspond to, or
keep them as they are) so existing products stay valid, and run the seed.
The loader batches by level, so the full tree loads in a few statements;
search stays indexed. If an external id must be kept alongside the code
(for feeds), add a nullable `externalId` column with its own migration.
Storefront pages cache a product's breadcrumb until the product next
changes; a taxonomy rename shows there after the next change or cache
expiry.

## 3. Inventory

- `InventoryItem` 1:1 with variant; `InventoryLevel` per location with
  `available`, `reserved`, `incoming`.
- **Single entry point:** `adjustInventory(tx, ctx, changes[], reason, reference)`. It applies conditional updates, rejects negative `available`
  unless the variant's policy is `CONTINUE` (oversell allowed), and appends
  one `InventoryMovement` per change with `resultingValue`. No other code
  writes `InventoryLevel`.
- Flows:

| Event                               | available            | reserved                                                     | Movement reason                                       |
| ----------------------------------- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| Checkout enters payment             | −q                   | +q                                                           | `RESERVATION`                                         |
| Reservation expires / payment fails | +q                   | −q                                                           | `RESERVATION_RELEASE`                                 |
| Order created from reservation      | —                    | — (reservation `CONVERTED`, stays reserved until fulfilment) | —                                                     |
| Fulfilment                          | —                    | −q                                                           | `FULFILMENT`                                          |
| Order cancelled before fulfilment   | +q                   | −q                                                           | `CANCELLATION`                                        |
| Refund with restock                 | +q                   | —                                                            | `RETURN`                                              |
| Merchant edit                       | ±q                   | —                                                            | `MANUAL_ADJUSTMENT` (note required above a threshold) |
| Transfer between locations          | −q at A, +q at B     | —                                                            | `TRANSFER` (two movements, one transaction)           |
| Purchase order received             | +q (and −q incoming) | —                                                            | `RECEIVED` / `RESTOCK`                                |

- Lock order: when a transaction touches several levels, rows are locked in
  a deterministic order (by `inventoryItemId, locationId`) to avoid
  deadlocks.
- Location selection for online orders: the first location with
  `fulfilsOnlineOrders` and sufficient stock, by merchant-defined priority.
  (Split fulfilment is a later enhancement.)

## 4. Pricing pipeline (`calculateCart`)

A pure function over a server-loaded snapshot:

```text
lines (variant, qty) + current variant prices
  → line subtotals
  → automatic discounts + entered codes (discount service)
  → shipping options for the address (shipping service)
  → tax (TaxCalculator for store config + address)
  → totals
```

- Inputs come **only from the database** (prices, discounts, rates). The
  client sends variant IDs, quantities, codes and an address, never prices.
- Output is a fully itemised `PriceQuote` (per-line discount allocation, tax
  lines, shipping line, totals) plus a `pricingHash` over its canonical
  serialisation.
- `pricesIncludeTax` (VAT/GST-style inclusive pricing) and exclusive pricing
  are both supported; tax is computed per line and allocated deterministically.
- `TaxCalculator` interface: `manual` (store-configured `TaxRate`s by
  country/region) first; external providers and jurisdiction-specific logic
  (e.g. India GST intra-state CGST+SGST vs inter-state IGST) plug in behind
  it.

## 5. Checkout

```text
Cart → Checkout(OPEN) → contact → address → shipping → (tax) → discount → PAYMENT_PENDING → Order
```

1. `startCheckout(cartToken)` creates a `Checkout` with its own token.
2. Each step updates the checkout and **recomputes the quote server-side**.
3. `beginPayment(checkoutToken, idempotencyKey)`:
   - Re-validates everything: variants still `ACTIVE` and purchasable,
     current prices, discount eligibility and limits, shipping rate valid for
     the address, tax, inventory, and currency equals store currency.
   - Recomputes the quote. If the `pricingHash` differs from what the
     shopper last saw, it returns `PRICE_CHANGED` with the new quote. The
     shopper must confirm, and the server never charges a different amount
     silently.
   - Reserves inventory (`RESERVATION`, expiry 15 min).
   - Creates `Payment(PENDING)` with a unique idempotency key and calls
     `PaymentProvider.createPayment` for exactly the quote's total.
4. Payment confirmation (webhook, or synchronous confirmation verified
   server-side with the provider): `completeCheckout()` in one transaction:
   allocate order number, create `Order` + lines/addresses/discounts/
   shipping/tax snapshots, convert reservations, record discount
   redemptions (checking usage limits again under lock), link the payment,
   mark the checkout `COMPLETED`, write `order.created`/`order.paid` outbox
   events and an audit record.
   - Idempotent by `checkoutId` (`Order.checkoutId` unique): webhook and
     redirect racing each other create one order.
5. A payment that succeeds after the reservation expired is still honoured
   when stock allows. Otherwise the order is created with an "inventory
   short" flag for the merchant, which is safer than taking money and
   creating nothing. The policy is configurable.

## 6. Orders

- Orders are immutable snapshots ([erd.md §4.5](../database/erd.md#45-customers-checkout-and-orders)).
  They are never recalculated from current prices.
- `paymentStatus` and `fulfilmentStatus` are independent state machines.
  Transitions happen only through services (`captureOrder`, `refundOrder`,
  `createFulfilment`, `cancelOrder`), each writing an `OrderEvent`, an audit
  record and an outbox event.
- Cancel = release reservations/restock, void or refund payments as chosen,
  `fulfilmentStatus = CANCELLED`, `cancelledAt` set.
- Order edits (adding/removing items after purchase) are a later feature
  and will be modelled as additional adjustment records, not line mutation.

## 7. Payments (`packages/payments`)

```ts
interface PaymentProvider {
  readonly id: string;
  readonly capabilities: {
    manualCapture: boolean;
    partialRefund: boolean;
    currencies: readonly CurrencyCode[];
  };
  createPayment(conn: ProviderConnection, input: CreatePaymentInput): Promise<CreatePaymentResult>; // redirect URL or client secret
  authorise(conn, paymentRef): Promise<PaymentStatusResult>;
  capture(conn, paymentRef, amount: Money): Promise<PaymentStatusResult>;
  refund(conn, paymentRef, amount: Money, idempotencyKey: string): Promise<RefundResult>;
  getStatus(conn, paymentRef): Promise<PaymentStatusResult>;
  verifyAndParseWebhook(rawBody: Buffer, headers: Headers, conn): Promise<NormalisedPaymentEvent>;
}
```

- Providers are registered in a provider registry. Order logic depends only
  on the interface, so adding a gateway never touches checkout or orders.
- First provider: **Stripe (Connect)** or **Razorpay (Route/partner OAuth)**,
  depending on launch market (open question Q3). Account linking via
  OAuth/Connect is preferred, so Storevia holds no merchant secret keys.
  Where a provider needs merchant API keys, they're stored
  **envelope-encrypted** (`credentialsCiphertext`, KMS-managed key,
  `keyVersion` for rotation) and decrypted only in the payment call path.
- Card data never touches Storevia servers: hosted payment pages or
  provider elements only, which keeps PCI scope at SAQ-A.
- Merchant payment webhooks are verified, recorded in `PaymentWebhookEvent`
  (unique per provider event) and processed idempotently, mirroring
  billing webhooks.
- The test provider (`storevia-test`) behaves deterministically for E2E tests
  (card numbers → outcomes) and is disabled in production builds.

## 8. Discounts

- Types: `PERCENTAGE` (basis points), `FIXED_AMOUNT` (money), `FREE_SHIPPING`.
- Method: `CODE` or `AUTOMATIC`.
- Conditions: minimum subtotal, target products/collections, eligible
  customers, date range, total usage limit, per-customer limit,
  combinability.
- Evaluation is a **pure service** (`evaluateDiscounts(quoteInput, discounts, redemptionCounts)`) with a table-driven test suite. The
  database stores the rule data; the logic lives in code.
- Usage limits are enforced twice: at quote time (advisory) and at order
  creation under row lock on `Discount` (authoritative), so concurrent
  checkouts can't exceed a limit.
- Discount amounts are allocated across lines (`allocate`) so refunds of
  individual lines return the right amount.

## 9. Customers

- Store-scoped `Customer` records, created at checkout (by email) or by the
  merchant. Separate from `User` (see [04-auth-rbac.md](./04-auth-rbac.md) §1).
- Marketing consent is stored with a timestamp and never inferred.
- Erasure and export follow [data-lifecycle.md](../database/data-lifecycle.md) §5.

## 10. Tests required (M3/M6)

Money property tests; variant matrix generation; inventory movement ledger
integrity (sum of movements = level for each item, checked in tests and by
a reconciliation job); concurrent reservation (no oversell under
parallel checkouts with `DENY`); discount rule table; tax inclusive and
exclusive; quote recomputation detects price change; idempotent order
creation under webhook/redirect race; refund totals never exceed captured
amounts.

## 11. As built in Milestone 6 (ADR-0031)

What the sections above describe, as implemented, with the refinements:

| Area                  | Implementation                                                                                                                        | Refinement of the baseline                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing (§4)          | `priceCheckout()` in `commerce/src/checkout/pricing.ts`, pure; `quoteHash()` over the quote                                           | One code discount per checkout; no automatic discounts; manual tax only (country + optional region rates, inclusive or exclusive, optional shipping tax)                                                                                            |
| Checkout (§5)         | `commerce/src/checkout/service.ts` under the `storevia_checkout` role                                                                 | Reservation happens in `beginPayment`, with the payment row, before any provider call; the attempt window is 15 minutes, the checkout 60 minutes after its last change                                                                              |
| Order creation (§5.4) | `commerce/src/checkout/confirm.ts`                                                                                                    | Idempotent per checkout; outbox events come from database triggers, not the service; the audit trail is the order timeline (`OrderEvent`) because the shopper has no user identity                                                                  |
| Late capture (§5.5)   | Expiry sweep asks the provider first; a later capture re-claims stock                                                                 | Not configurable: an order is always created, with `stockShortage` when stock had to go negative                                                                                                                                                    |
| Orders (§6)           | `commerce/src/orders/{read,manage}.ts`                                                                                                | `status` (`OPEN`/`CANCELLED`) replaces the `CANCELLED` fulfilment status; cancellation only while nothing is fulfilled                                                                                                                              |
| Payments (§7)         | `packages/payments`: `createPayment`, `getPayment`, `verifyReturn`, `verifyWebhook`, `parseWebhook`, `cancelPayment`, `refundPayment` | Automatic capture only (no `authorise`/`capture` split); first provider Razorpay Payment Links with the merchant's own keys (AES-256-GCM, bound to the connection); the test provider's outcomes are chosen on its hosted page, not by card numbers |
| Discounts (§8)        | `commerce/src/settings/discounts.ts`                                                                                                  | `CODE`, order-wide `PERCENTAGE`/`FIXED_AMOUNT`, minimum subtotal, dates, active flag, total usage limit (reserved at payment start under the discount row lock). Targeting, per-customer limits, free shipping and combinability are later          |
| Customers (§9)        | `commerce/src/customers.ts`                                                                                                           | Created only at checkout, one per store and email (case-insensitive); merchants keep a note and tags; no consent is stored or inferred                                                                                                              |
| Refunds               | `refundOrder()`                                                                                                                       | Bounded by captured − (succeeded + pending) under the payment row lock; the provider is called after commit; restock only for fulfilled units, explicitly per line                                                                                  |
| Fulfilment            | `fulfilOrder()`                                                                                                                       | Per-line quantities under row locks and a conditional update; reserved stock ships from the reservation's location                                                                                                                                  |
| Emails                | `commerce/src/orders/notifications.ts`, worker job `orders.notifications`                                                             | Queued in the changing transaction, sent at least once with backoff; a failure never touches the order                                                                                                                                              |
| Shipping, addresses   | `commerce/src/settings/shipping.ts`, `commerce/src/checkout/input.ts` (`parseAddress`), reference data `@storevia/validation/geo`     | Zones and addresses use the same country and region codes; a country is in at most one zone per store; rates come only from the store's rows (no built-in amounts or countries)                                                                     |

**Countries and regions.** `packages/validation/src/geo.ts` is the one list
of countries (ISO 3166-1 alpha-2, English names) that the store country,
shipping zones, tax rates and checkout addresses are chosen from, with
lookups `countryByCode`, `regionByCode`, `regionByName` (case, accent and
spacing insensitive) and `hasRegions`. Region codes are ISO 3166-2
subdivision codes without the country prefix (`IN-WB` is stored as `WB`), so
a zone's `regionCodes`, a tax rate's `regionCode` and an address's
`regionCode` compare directly. India (28 states, 8 union territories, codes
current as of 2025: `CG`, `OD`, `TS`, `UK`, `DH`, `LA`), the US (50 states
and DC), Canada and Australia have region lists; other countries have
`regions: null`. Superseded ISO codes (`OR`, `CT`, `TG`, `UT`, `DN`, `DD`)
are accepted as input and stored as the current code.

- Checkout (no client script): the address form is drawn for one country
  (the one just submitted, else the saved one, else the store's). With a
  region list it shows a required State select of names (value = code);
  otherwise an optional "State / region" text field. The form also sends
  `regionCountry`, the country whose list it showed: when the shopper
  changes the country, a state from the old list isn't trusted, so the form
  comes back with "Choose your state." and the new country's list.
  `parseAddress` accepts a region as code or name and stores both the
  canonical code and the name; India's PIN is required and must be 6 digits
  (first 1–9, spaces removed); other countries keep free-text postal codes.
  Saved addresses are read back by shape only (`storedAddress`), so stricter
  rules never drop an address a payment in flight relies on.
- Matching: a rate covers an address when a zone country matches and the
  zone has no regions or lists the address's region code; `PRICE_BASED`
  rates also check the subtotal after discount. After a valid address, no
  matching rate is `SHIPPING_UNAVAILABLE`: "We don't currently ship to this
  address."
- Settings → Shipping: countries are ticked by name in a searchable
  checklist; with exactly one country that has a region list, its regions
  can be ticked too (none = whole country). The service accepts lists or
  comma-separated codes, refuses codes not in the reference data and
  regions for anything but a single listed country, and names the country
  and zone when a country is already in another zone.
- To add a country's regions: give its entry in `geo.ts` the full current
  ISO 3166-2 list (`regions`), `regionLabel`/`regionsLabel`, any superseded
  codes as `formerCodes`, and a count test in `geo.test.ts`; a postal rule
  (`postalCode`) is optional. Existing zones and tax rates for that country
  keep working (they cover the whole country until regions are ticked).

Tests (§10) live in `packages/commerce/src/checkout/*.test.ts` (pricing,
state machines, address input), `packages/commerce/tests/checkout.int.test.ts`,
`shipping.int.test.ts`, `orders.int.test.ts`,
`packages/database/tests/checkout-orders.int.test.ts` and
`packages/validation/src/geo.test.ts`; [11-testing.md](./11-testing.md) lists
what each covers.

## 12. Order operations after payment (post-M7, ADR-0033)

[ADR-0033](../adr/0033-order-operations-after-payment.md) covers what
happens after payment:

- **Separate states.** Payment, fulfilment, delivery and order state are
  kept separate.
- **Fulfilment journey.**
  - Shipping: Ready → Shipped → In transit → Out for delivery → Delivered.
  - Local delivery: Ready → Out for delivery → Delivered.
  - Tracking can be edited after fulfilment.
- **Completion.** "Mark complete" is gated, with an audited override.
- **Archiving.** Real orders are archived, never deleted. Deleting a demo
  order is possible in development and test only, and never for live
  payments.
- **Shopper link.** The private order link (`/orders/view/<token>`) opens a
  customer-safe view with a message box.
- **Notifications.** Customer messages notify staff with `order.message`
  who can open the store, through the worker. Staff replies are emailed
  through the notification outbox.

Services:

- `packages/commerce/src/orders/lifecycle.ts`: pure rules.
- `operations.ts`: archive, demo delete, fulfilment edits, completion.
- `access.ts`: order link tokens.
- `customer.ts`: the shopper's view and messages.
- `messages.ts`: the staff side and notification fan-out.
- `staff-notifications.ts`: the bell.

Migrations:

- `20270201000000_order_operations`
- `20270201000100_demo_purge_checkout`
