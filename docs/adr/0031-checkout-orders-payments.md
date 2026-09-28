# ADR-0031: Checkout, orders and payments (Milestone 6)

- Status: Accepted
- Date: 2026-09-27

## Context

Milestone 6 turns Storevia into a store that takes money: checkout from the
M4 cart, orders, customers, shipping, manual tax, discounts, a payment
abstraction with a test provider and a first real provider, refunds,
fulfilment and the merchant's orders dashboard. The M0 baseline fixed most
of the shape ([09-commerce.md](../architecture/09-commerce.md) §3–§9, the
draft ERD §8–§13). This ADR records the audit of what exists at `fe05bff`
and the decisions that refine or narrow the baseline.

## Audit of the foundation (HEAD fe05bff)

1. **Cart / CartLine (M4).** Opaque 256-bit token in a host-only cookie, only
   its SHA-256 stored; lines hold variant ids and quantities, never prices;
   every view is re-priced from current variant prices through the
   `storevia_storefront` role, whose restrictive policies scope `Cart` and
   `CartLine` to `app_current_store()`. `Cart.customerId` is forced NULL by a
   CHECK. Carts live 30 days; availability is a boolean from a definer
   function, never a count. Checkout can start from this cart unchanged.
   _Correction (migration `20261210010000_cart_stock`):_ the cart, the product
   page and checkout share one stock rule, `app_variant_stock()` — a tracked
   DENY variant can be bought up to the largest `available` at one active,
   online-fulfilling location, which is what §3 reserves (a line is reserved
   whole at one location). The cart refuses (never clamps) a quantity above
   that or above 99, marks a line stock can no longer supply
   (`insufficient`/`sold_out`, left out of the subtotal), and a checkout
   can't start while such a line remains; checkout lists it as `LOW_STOCK` or
   `SOLD_OUT`. The cart still reserves nothing: the reservation at payment
   decides.
2. **Money.** `packages/commerce/src/money.ts`: bigint minor units, ISO-4217
   exponents, explicit rounding modes, `applyBasisPoints`, `applyPpm`,
   largest-remainder `allocate`, mismatched currencies throw. Property
   tested. Reused as is.
3. **Inventory write path (M3).** `adjustInventoryInTx` locks level rows in
   id order, applies a conditional SQL update and appends an
   `InventoryMovement`. It knows only `available` and the merchant reasons.
   `InventoryLevel.reserved` (CHECK ≥ 0) and the reasons `SALE`,
   `RESERVATION`, `RESERVATION_RELEASE`, `CANCELLATION`, `FULFILMENT`,
   `RETURN` already exist but are unused. M6 extends the same module; no
   second path writes stock.
4. **Provider abstractions.** M2's `BillingProvider` (SaaS billing) gives the
   pattern: provider-neutral interface, `verifyWebhook` over raw bytes,
   `WebhookVerificationError`, an idempotent ledger (`BillingWebhookEvent`),
   state applied under a lock, and a fail-closed environment gate for the
   mock. Merchant payments are a different domain (money flows to the
   merchant, not to Storevia) and get their own interface; the patterns are
   reused, the code is not shared.
5. **Worker / outbox.** Triggers write `OutboxEvent`s in the changing
   transaction; `storefront.outbox-dispatch` turns them into cache tags.
   Jobs run with leases, retries and metrics (`@storevia/jobs`). M6 adds
   sweeps and a notification queue on the same runner.
6. **Target models in the draft ERD.** Customer, CustomerAddress, Checkout,
   InventoryReservation, Discount (+ codes, products, collections,
   redemptions), ShippingZone/Country/Rate, TaxConfiguration, TaxRate,
   Order (+ lines, addresses, discounts, shipping lines, tax lines, events),
   PaymentProviderConnection, Payment, PaymentWebhookEvent, Refund,
   RefundLine, Fulfilment, FulfilmentLine, ApiKey, WebhookEndpoint,
   WebhookDelivery(+Attempt), IdempotencyKey. `Store.nextOrderNumber`
   (default 1001) is already live.
7. **Already in the ERD:** all of the above. **Promoted in M6:** Customer,
   Checkout, InventoryReservation, Discount, DiscountCode,
   DiscountRedemption, ShippingZone, ShippingZoneCountry, ShippingRate,
   TaxConfiguration, TaxRate, Order, OrderLine, OrderAddress, OrderDiscount,
   OrderShippingLine, OrderTaxLine, OrderEvent, PaymentProviderConnection,
   Payment, PaymentWebhookEvent, Refund, RefundLine, Fulfilment,
   FulfilmentLine, and one new table, `OrderNotification` (§12).
8. **Deferred:** CustomerAddress (addresses are snapshotted on orders; an
   address book belongs with customer accounts), DiscountProduct and
   DiscountCollection (M6 discounts apply to the whole order), automatic
   discounts, `FREE_SHIPPING` discounts (free shipping is a shipping rate),
   per-customer limits, weight-based rates, ApiKey, WebhookEndpoint,
   WebhookDelivery(+Attempt), IdempotencyKey, product `Category` (§14).
9. **Dependency direction.** `@storevia/payments` (provider interface,
   adapters, registry; no database) ← `@storevia/commerce` (checkout, orders,
   payments persistence) ← apps. The Site Engine imports none of them; the
   storefront app composes checkout routes the way it composes the cart.
   `@storevia/security` gains the credential cipher (generic).
10. **Roles.** Public reads use `storevia_storefront`; M6 does **not** widen
    it (§9).

## Decision

### 1. Checkout lifecycle

The ERD's states, with transitions defined once (`checkout/state.ts`):

```text
OPEN ──beginPayment──▶ PAYMENT_PENDING ──payment captured──▶ COMPLETED
  ▲                         │
  └──payment failed/cancelled (reservations released)
OPEN / PAYMENT_PENDING ──expiry sweep──▶ EXPIRED
```

- A checkout starts from a non-empty ACTIVE cart of the resolved store,
  gets its own opaque token (hash stored, host-only cookie), and expires 60
  minutes after its last change; a payment attempt has its own 15-minute
  window. Expired checkouts accept nothing but the sweep.
- Guest checkout only: email, shipping address, billing address (same as
  shipping by default), shipping rate, one discount code. Steps are server
  forms that redirect; the address step opens once the email is saved, and
  an address change clears a chosen rate that no longer applies. Countries
  and regions come from one reference list (`@storevia/validation/geo`):
  where a country has a region list (India, the US, Canada, Australia) the
  state is chosen from it, required, and stored as its ISO 3166-2 code and
  name; elsewhere it is optional free text. India's PIN code is required
  (6 digits). A valid address that no zone covers is told "We don't
  currently ship to this address." A failed
  step's errors and typed values travel in a 60-second host-only flash
  cookie that shows only on the redirect naming it (`?f=<id>`), so a later
  successful step can't show stale errors; clearing it repeats the cookie's
  attributes (a `__Host-` cookie can't be removed without `Secure`).
- The browser sends selections only. Every step re-prices server-side and
  stores the quote; `beginPayment` re-prices again and compares the
  `pricingHash` the shopper confirmed. A difference returns the typed
  conflict (`PRICE_CHANGED`, `ITEM_UNAVAILABLE`, `QUANTITY_CHANGED`,
  `DISCOUNT_CHANGED`, `SHIPPING_CHANGED`) and the new quote; nothing is
  charged until the shopper reviews it.

### 2. Pricing

`priceCheckout(snapshot)` is pure (no I/O), in `commerce/src/checkout/pricing.ts`:

1. Line subtotal = unit price × quantity (store currency; a variant in
   another currency makes the line unavailable).
2. Discount (one code): percentage = subtotal × bps rounded **half-up** to the
   minor unit; fixed = min(amount, subtotal). Allocated to lines by
   subtotal with `allocate` (largest remainder), so line discounts always
   sum to the order discount.
3. Shipping: the chosen rate's amount if it applies to the address and the
   discounted subtotal.
4. Tax (manual): the store's rates for the country, plus the region's rates
   when the address has a region code. Each rate is applied per taxable
   line to (line subtotal − line discount), rounded **half-even**; exclusive
   prices add tax, inclusive prices extract `amount × ppm / (1 000 000 + ppm)`.
   Shipping is taxed only when the store says so.
5. Total = subtotal − discount + shipping + (exclusive tax).

The quote carries every line, allocation and tax line; its hash is SHA-256
over a canonical serialisation. Orders copy the quote, never recompute it.

### 3. Inventory reservation

Following 09 §3, with one refinement: reservation happens at
`beginPayment`, inside the transaction that creates the payment, before any
provider call.

- Tracked variants only. For each line, the first active,
  online-fulfilling location (by priority) that has the quantity is chosen;
  `available −q, reserved +q` (`RESERVATION`). A `DENY` variant with no such
  location fails the whole attempt with `ITEM_UNAVAILABLE`; a `CONTINUE`
  variant reserves at the first location even below zero.
- Levels are locked in `(inventoryItemId, locationId)` order: two shoppers
  racing for the last unit serialise, and one gets `ITEM_UNAVAILABLE`
  before any payment exists.
- Payment failed / cancelled / expired: `available +q, reserved −q`
  (`RESERVATION_RELEASE`), reservation `RELEASED`.
- Order created: reservation `CONVERTED`, stock stays reserved.
- Fulfilment: `reserved −q` (`FULFILMENT`). Cancellation before
  fulfilment: `available +q, reserved −q` (`CANCELLATION`). Refund with
  restock (explicit per line): `available +q` (`RETURN`).
- Every change goes through the M3 module and appends a movement with the
  checkout or order as reference.

### 4. Payments

`@storevia/payments` defines `PaymentProvider`
(`createPayment`, `getPayment`, `verifyReturn`, `verifyWebhook`,
`parseWebhook`, `cancelPayment`, `refundPayment`), normalised in Storevia
terms. Checkout depends only on the interface.

- **Hosted pages only**: the shopper is redirected to the provider and back.
  Storevia never sees card data (SAQ-A) and the storefront stays free of
  client JavaScript.
- **Authority**: a payment is captured only on a verified webhook or a
  server-side status fetch from the provider. The return redirect is a
  prompt to check, never proof. The provider's amount and currency must
  equal the payment's, or the payment is marked failed (`AMOUNT_MISMATCH`)
  and no order is created.
- **States** (ERD): `PENDING → CAPTURED | FAILED | CANCELLED` (M6 captures
  automatically; `AUTHORISED` / `REQUIRES_ACTION` exist for later
  providers). Transitions in one function, under a row lock.
- **Idempotency**: `Payment.idempotencyKey` (checkout + attempt),
  `PaymentWebhookEvent` unique per provider event, `Order.checkoutId`
  unique, state transitions that are no-ops when repeated. A captured event
  delivered three times, or a webhook racing the return, creates one order,
  one set of movements and one notification.
- **Late capture**: the expiry sweep asks the provider before releasing a
  pending attempt (captured → finalise; otherwise cancel at the provider,
  then release). A capture that still arrives after release creates the
  order if stock can be claimed again; otherwise the order is created with
  `stockShortage = true` and a timeline event for the merchant, so money is
  never taken without a record.
- **Test provider** (`storevia-test`): hosted page on the storefront with
  succeed / fail / cancel / pay-later; signed callbacks drive the same
  webhook pipeline. Enabled only in development and test (a production
  build must also set `TEST_PAYMENTS_ENABLED=true`), never in staging,
  preview or production.
- **First real provider: Razorpay** (Q3). Storevia's launch market is India
  (stores default to INR, GST is the tax model to grow into) and Razorpay is
  the standard gateway there. Integration uses **Payment Links** (hosted
  page, redirect with a signed callback), the Payments and Refunds APIs, and
  webhooks signed with HMAC-SHA256 over the raw body. Each store connects
  **its own Razorpay account** (key id, key secret, webhook secret): funds
  settle to the merchant, Storevia is never in the money flow. Stripe fits
  behind the same interface later.
- **Credentials** are encrypted with AES-256-GCM (`@storevia/security`
  `SecretCipher`), bound to the connection as associated data, with a
  versioned keyring from `PAYMENT_CREDENTIALS_KEYS` (`1:<base64>,2:<base64>`;
  KMS/Secrets Manager in production); never returned to the browser
  (masked as `rzp_test_…1234`), never logged, decrypted only in the payment
  call path.
- Webhooks arrive at the platform host,
  `/api/webhooks/payments/{connectionId}`, so a store's domain change never
  breaks them.

### 5. Orders

- Created only when a payment is captured, in one transaction: allocate the
  order number (`Store.nextOrderNumber` under row lock), upsert the
  customer, snapshot every line/address/discount/shipping/tax value from
  the checkout's quote, convert reservations, convert the discount
  redemption, link the payment, complete the checkout and the cart, and
  write the timeline, outbox and notification rows.
- `status` (`OPEN`, `CANCELLED`) is separate from `paymentStatus` (`PAID`,
  `PARTIALLY_REFUNDED`, `REFUNDED`) and `fulfilmentStatus` (`UNFULFILLED`,
  `PARTIALLY_FULFILLED`, `FULFILLED`). The ERD's `CANCELLED` fulfilment
  status is replaced by `Order.status`. "Completed" is derived (paid and
  fulfilled), not stored.
- Immutable snapshots: column grants let the merchant role update only
  status, payment/fulfilment state, refunded amounts, cancellation fields,
  note and tags; lines only their fulfilled/refunded quantities; addresses,
  discounts, shipping and tax lines not at all. A trigger refuses changes to
  snapshot columns from any role.
- Order numbers are per store (#1001, #1002, …), concurrency safe, and give
  no access on their own: shoppers see their order through the checkout
  token; merchants through RBAC.

### 6. Customers

One `Customer` per store and normalised email (citext, partial unique
index), created or matched when an order is created. A returning guest
with the same email is the same customer; empty name or phone fields are
filled from the new order, existing values are not overwritten; addresses
stay on orders. No login, no marketing consent inferred, no merging across
emails.

### 7. Shipping, tax, discounts

- Shipping: zones by country (optionally one country's regions; a country
  is in at most one zone per store), rates `FLAT` or `PRICE_BASED`
  (subtotal range; 0 = free). Zone countries and regions are chosen by name
  and must be in the reference list. Selected by id, re-validated for the
  store, address and subtotal every time.
- Tax: `TaxConfiguration` (inclusive/exclusive, tax shipping) and `TaxRate`
  (country, optional region, ppm). No compound rates in M6 (CHECK).
- Discounts: `CODE` only, `PERCENTAGE` or `FIXED_AMOUNT` over the whole
  order, minimum subtotal, start/end, active flag, total usage limit.
  The plan feature `discounts` gates creation. Codes are case-insensitive
  (stored upper-case, unique per store). **A use is reserved at
  `beginPayment`** (conditional `usageCount + 1` under the discount row
  lock, a `DiscountRedemption` in `RESERVED`), converted with the order and
  released with the reservation, so the last use can't be sold twice.

### 8. Refunds, cancellation, fulfilment

- Refund (`order.refund`): amount ≤ captured − (succeeded + pending
  refunds), computed under the payment row lock, same currency; provider
  call after commit; `Refund` immutable apart from its outcome; restock is
  an explicit per-line choice (`RETURN` movement).
- Cancel (`order.manage`): only while nothing is fulfilled; releases
  reserved stock (`CANCELLATION`) and, if chosen, refunds the remaining
  captured amount; repeating it is a no-op.
- Fulfil (`order.manage`): quantities per line under `FOR UPDATE` on the
  order lines; the sum can never exceed ordered − already fulfilled
  (conditional update + CHECK), optional tracking; moves reserved stock out.

### 9. Database roles

- **New `storevia_checkout` role (NOBYPASSRLS)** for every shopper-driven
  checkout operation and payment confirmation. Its policies are restrictive
  and double-scoped: the resolved store (`app.store_id`) **and** the current
  checkout (`app.checkout_id`, set only after the token or a verified
  provider reference identified it). It sees one checkout, its payments,
  its order, the customer with that checkout's email, and the store's
  sellable catalogue, stock, rates and discounts. It cannot list orders,
  customers or payments.
- `storevia_storefront` is unchanged: no customer, order, payment or
  configuration access.
- `storevia_app` (merchant) gets tenant-scoped reads and the narrow writes
  above; `storevia_worker` gets what the sweeps and notifications need.

### 10. Rate limits

Per store and client address: checkout creation, step updates, discount
codes, payment starts, return verification; per connection for webhook
failures; per member for refunds. Buckets are prefixed (`checkout:`), so
one store can't exhaust another's.

### 11. Outbox events

`order.created`, `order.paid`, `order.cancelled`, `order.fulfilled` and
`refund.created` are written **by database triggers** on `Order` (insert;
status and fulfilment-status changes) and `Refund` (settled as succeeded),
in the changing transaction, like the M4 cache events: whichever role or
service changes an order, the event can't be forgotten, and no role needs
INSERT on `OutboxEvent`. Events carry ids and numbers only. The storefront
cache consumer maps them to no tags. They are the source for outbound
webhooks later.

### 12. Notifications

`OrderNotification` (order, kind, recipient, status, attempts, next attempt)
is written in the same transaction as the event it announces and sent by a
worker job with retries: order confirmation, refund, fulfilment,
cancellation. Email failure never rolls back an order. Delivery is at least
once (a crash after sending and before marking can repeat one email).

### 13. Admin API and outbound webhooks: deferred

The roadmap moved API keys and outbound webhooks here. They are deferred to
a later milestone as a whole (keys with hashed secrets, scopes, rotation,
signed deliveries, retries, a delivery log): half of that platform would be
worse than none. The outbox events above are the integration point.

### 14. Product taxonomy: deferred

M6's manual tax needs only the variant's `taxable` flag and the address's
country and region. A `Category` would carry no rule yet, so it stays in the
ERD until jurisdiction-specific rates (e.g. GST by HSN) need it.

## Consequences

- One new database role and one new environment variable per deployment
  (`DATABASE_CHECKOUT_URL`), plus `PAYMENT_CREDENTIALS_KEY`.
- Checkout adds no client JavaScript: every step is a form; payment is a
  redirect.
- Everything money-related is recomputed from the database and snapshotted
  once. Orders never change their commercial values.
- Deferred with reasons: CustomerAddress, targeted/automatic/free-shipping
  discounts, per-customer limits, weight-based shipping, compound tax,
  Category, Admin API and outbound webhooks, customer accounts, order edits,
  partial capture, split fulfilment, carrier integrations, invoices.

## Alternatives considered

- **Widen `storevia_storefront`.** Rejected: every public read path would
  then carry order and customer access.
- **SECURITY DEFINER functions for checkout writes.** Rejected: order
  creation in PL/pgSQL would duplicate the domain logic and its tests.
- **A BYPASSRLS checkout role (like billing).** Rejected: shopper-driven code
  should keep row-level store scoping.
- **Razorpay Standard Checkout (checkout.js).** Rejected for M6: it needs
  third-party script on the storefront and a CSP exception; Payment Links
  keep the redirect model the test provider uses.
- **Reserving stock at add-to-cart.** Rejected (brief and 09 §3): carts
  would hold stock for days.
