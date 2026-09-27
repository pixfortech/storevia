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

Tests (§10) live in `packages/commerce/src/checkout/*.test.ts` (pricing,
state machines), `packages/commerce/tests/checkout.int.test.ts`,
`orders.int.test.ts` and `packages/database/tests/checkout-orders.int.test.ts`;
[11-testing.md](./11-testing.md) lists what each covers.
