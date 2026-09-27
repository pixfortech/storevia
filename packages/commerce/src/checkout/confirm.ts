import type { TenantTx } from "@storevia/database";
import { createLogger, recordMetric } from "@storevia/observability";
import type { ProviderPaymentState } from "@storevia/payments";
import { uuidv7 } from "@storevia/types";
import { orderEvent, queueNotification } from "../orders/records";
import { loadCheckout, type CheckoutRow } from "./load";
import { parseStoredQuote, type PriceQuote } from "./pricing";
import { assertCheckoutTransition, assertPaymentTransition, type PaymentStatus } from "./state";
import { convertCheckoutStock, releaseCheckoutStock, reserveStock, type StockScope } from "./stock";

// Payment outcomes and order creation (ADR-0031 §4, §5), under the checkout
// role with the checkout already identified (its token, or a provider
// reference from a verified webhook or a server-side status fetch). Every
// path locks the checkout, then the payment, then stock, then the discount,
// so concurrent confirmations (webhook × return × sweep) serialise and the
// second one finds nothing left to do: one order, one set of movements, one
// notification.

const log = createLogger({ component: "checkout" });

export interface PaymentRow {
  readonly id: string;
  readonly checkoutId: string;
  readonly connectionId: string;
  readonly provider: string;
  readonly providerPaymentId: string | null;
  readonly status: PaymentStatus;
  readonly amount: bigint;
  readonly currency: string;
  readonly orderId: string | null;
  readonly redirectUrl: string | null;
  readonly expired: boolean;
}

export async function lockPaymentByReference(
  tx: TenantTx,
  provider: string,
  providerPaymentId: string,
): Promise<PaymentRow | null> {
  const rows = await tx.$queryRaw<PaymentRow[]>`
    SELECT id, "checkoutId", "connectionId", provider, "providerPaymentId", status::text AS status,
      amount, trim(currency) AS currency, "orderId", "redirectUrl", "expiresAt" <= now() AS expired
    FROM "Payment" WHERE provider = ${provider} AND "providerPaymentId" = ${providerPaymentId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

export async function lockPendingPayment(tx: TenantTx): Promise<PaymentRow | null> {
  const rows = await tx.$queryRaw<PaymentRow[]>`
    SELECT id, "checkoutId", "connectionId", provider, "providerPaymentId", status::text AS status,
      amount, trim(currency) AS currency, "orderId", "redirectUrl", "expiresAt" <= now() AS expired
    FROM "Payment" WHERE status = 'PENDING'
    FOR UPDATE`;
  return rows[0] ?? null;
}

export async function lockPaymentById(tx: TenantTx, id: string): Promise<PaymentRow | null> {
  const rows = await tx.$queryRaw<PaymentRow[]>`
    SELECT id, "checkoutId", "connectionId", provider, "providerPaymentId", status::text AS status,
      amount, trim(currency) AS currency, "orderId", "redirectUrl", "expiresAt" <= now() AS expired
    FROM "Payment" WHERE id = ${id}::uuid
    FOR UPDATE`;
  return rows[0] ?? null;
}

export type OutcomeResult =
  | {
      readonly kind: "completed";
      readonly orderId: string;
      readonly orderNumber: number;
      readonly created: boolean;
    }
  | { readonly kind: "failed" }
  | { readonly kind: "pending" }
  | { readonly kind: "ignored"; readonly reason: string };

/** Gives a checkout's reserved discount use back (failed, cancelled or expired payment). */
export async function releaseDiscountUse(tx: TenantTx, checkoutId: string): Promise<void> {
  const released = await tx.$queryRaw<{ discountId: string }[]>`
    UPDATE "DiscountRedemption" SET status = 'RELEASED', "updatedAt" = now()
    WHERE "checkoutId" = ${checkoutId}::uuid AND status = 'RESERVED'
    RETURNING "discountId"`;
  for (const r of released) {
    await tx.$executeRaw`
      UPDATE "Discount" SET "usageCount" = "usageCount" - 1, "updatedAt" = now()
      WHERE id = ${r.discountId}::uuid AND "usageCount" > 0`;
  }
}

/**
 * Takes one use of a discount for a checkout. The conditional increment
 * runs under the discount's row lock, so the last use can't be taken twice.
 */
export async function reserveDiscountUse(
  tx: TenantTx,
  scope: StockScope,
  checkoutId: string,
  discount: NonNullable<PriceQuote["discount"]>,
  email: string | null,
): Promise<boolean> {
  const taken = await tx.$executeRaw`
    UPDATE "Discount" SET "usageCount" = "usageCount" + 1, "updatedAt" = now()
    WHERE id = ${discount.discountId}::uuid AND status = 'ACTIVE'
      AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")`;
  if (taken === 0) return false;
  await tx.$executeRaw`
    INSERT INTO "DiscountRedemption" (id, "organisationId", "storeId", "discountId", "discountCodeId",
      "checkoutId", email, status, "updatedAt")
    VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
      ${discount.discountId}::uuid, ${discount.codeId}::uuid, ${checkoutId}::uuid, ${email},
      'RESERVED', now())
    ON CONFLICT ("discountId", "checkoutId") DO UPDATE SET status = 'RESERVED', "updatedAt" = now()`;
  return true;
}

/** Ends a pending attempt without money: stock and discount go back, the checkout reopens. */
export async function endAttempt(
  tx: TenantTx,
  scope: StockScope,
  checkout: CheckoutRow,
  payment: PaymentRow,
  to: "FAILED" | "CANCELLED",
  failure: { readonly code: string; readonly message: string | null },
): Promise<void> {
  if (payment.status !== "PENDING") return;
  assertPaymentTransition(payment.status, to);
  await tx.$executeRaw`
    UPDATE "Payment" SET status = ${to}::"PaymentStatus", "failureCode" = ${failure.code},
      "failureMessage" = ${failure.message}, "updatedAt" = now()
    WHERE id = ${payment.id}::uuid`;
  if (checkout.status === "PAYMENT_PENDING") {
    await releaseCheckoutStock(tx, scope, checkout.id);
    await releaseDiscountUse(tx, checkout.id);
    assertCheckoutTransition(checkout.status, "OPEN");
    await tx.$executeRaw`
      UPDATE "Checkout" SET status = 'OPEN', "updatedAt" = now() WHERE id = ${checkout.id}::uuid`;
  }
}

/**
 * Applies the provider's authoritative view of a payment to its checkout.
 * Idempotent: repeating an outcome, or delivering it after another path
 * applied it, changes nothing.
 */
export async function applyPaymentOutcome(
  tx: TenantTx,
  scope: StockScope,
  checkoutId: string,
  state: ProviderPaymentState,
  provider: string,
): Promise<OutcomeResult> {
  const checkout = await loadCheckout(tx, { id: checkoutId }, true);
  if (!checkout) return { kind: "ignored", reason: "unknown_checkout" };
  const payment = await lockPaymentByReference(tx, provider, state.providerPaymentId);
  if (payment?.checkoutId !== checkout.id) {
    return { kind: "ignored", reason: "unknown_payment" };
  }

  if (state.status === "pending") return { kind: "pending" };

  if (state.status !== "captured") {
    if (payment.status === "CAPTURED") {
      // A failure notice never undoes money that was taken.
      return { kind: "ignored", reason: "already_captured" };
    }
    await endAttempt(
      tx,
      scope,
      checkout,
      payment,
      state.status === "failed" ? "FAILED" : "CANCELLED",
      {
        code: state.status === "failed" ? "DECLINED" : state.status.toUpperCase(),
        message: null,
      },
    );
    return { kind: "failed" };
  }

  if (payment.status === "CAPTURED") {
    const order = await existingOrder(tx, checkout);
    return order
      ? { ...order, kind: "completed", created: false }
      : { kind: "ignored", reason: "no_order" };
  }

  if (state.amount !== payment.amount || state.currency !== payment.currency) {
    // Money was taken, but not what the shopper confirmed: no order; the
    // merchant resolves it with the provider (ADR-0031 §4).
    log.error("payment amount mismatch", {
      paymentId: payment.id,
      provider,
      expectedCurrency: payment.currency,
    });
    recordMetric("checkout.payment_amount_mismatch", 1, { provider });
    if (payment.status === "PENDING") {
      await endAttempt(tx, scope, checkout, payment, "FAILED", {
        code: "AMOUNT_MISMATCH",
        message: "The provider reported a different amount or currency.",
      });
    }
    return { kind: "failed" };
  }

  assertPaymentTransition(payment.status, "CAPTURED");
  await tx.$executeRaw`
    UPDATE "Payment" SET status = 'CAPTURED', "capturedAmount" = amount, "capturedAt" = now(),
      "providerChargeId" = ${state.chargeId}, "failureCode" = NULL, "failureMessage" = NULL,
      "updatedAt" = now()
    WHERE id = ${payment.id}::uuid`;
  recordMetric("checkout.payment_captured", 1, { provider });
  return completeCheckout(tx, scope, checkout, payment);
}

async function existingOrder(
  tx: TenantTx,
  checkout: CheckoutRow,
): Promise<{ orderId: string; orderNumber: number } | null> {
  if (!checkout.completedOrderId) return null;
  const rows = await tx.$queryRaw<{ id: string; number: number }[]>`
    SELECT id, "orderNumber" AS number FROM "Order" WHERE id = ${checkout.completedOrderId}::uuid`;
  const row = rows[0];
  return row ? { orderId: row.id, orderNumber: row.number } : null;
}

/** Creates the order for a captured payment, in the caller's transaction. */
async function completeCheckout(
  tx: TenantTx,
  scope: StockScope,
  checkout: CheckoutRow,
  payment: PaymentRow,
): Promise<OutcomeResult> {
  if (checkout.status === "COMPLETED") {
    // A second attempt captured for a checkout that already has its order
    // (e.g. an old attempt paid late): attach it so the merchant can refund it.
    const order = await existingOrder(tx, checkout);
    if (!order) return { kind: "ignored", reason: "no_order" };
    await tx.$executeRaw`
      UPDATE "Payment" SET "orderId" = ${order.orderId}::uuid, "updatedAt" = now()
      WHERE id = ${payment.id}::uuid`;
    await orderEvent(
      tx,
      scope,
      order.orderId,
      "payment.extra_capture",
      "Another payment attempt for this order was also captured. Refund it from this page.",
      { paymentId: payment.id },
    );
    log.warn("extra capture attached to order", { paymentId: payment.id });
    recordMetric("checkout.payment_extra_capture");
    return { kind: "completed", ...order, created: false };
  }

  const quote = parseStoredQuote(checkout.quote);
  if (
    !quote ||
    BigInt(quote.total) !== payment.amount ||
    quote.currency !== payment.currency ||
    !checkout.email
  ) {
    // The checkout changed after this attempt ended (documented limitation).
    log.error("captured payment does not match its checkout", { paymentId: payment.id });
    recordMetric("checkout.capture_without_order");
    return { kind: "ignored", reason: "quote_mismatch" };
  }

  // Stock: an attempt in flight holds its reservations; a late capture
  // claims stock again and flags a shortage when it had to oversell.
  let shortage = false;
  if (checkout.status !== "PAYMENT_PENDING") {
    const claimed = await reserveStock(
      tx,
      scope,
      checkout.id,
      quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      new Date(Date.now() + 60_000),
      { force: true },
    );
    shortage = claimed.ok && claimed.shortage;
  }
  // Another attempt that is still pending is superseded by this capture.
  await tx.$executeRaw`
    UPDATE "Payment" SET status = 'CANCELLED', "failureCode" = 'SUPERSEDED', "updatedAt" = now()
    WHERE status = 'PENDING' AND id <> ${payment.id}::uuid`;

  // Discount: convert the reserved use, or take one again for a late capture.
  let discountOverLimit = false;
  if (quote.discount) {
    const existing = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM "DiscountRedemption"
      WHERE "discountId" = ${quote.discount.discountId}::uuid AND "checkoutId" = ${checkout.id}::uuid
      FOR UPDATE`;
    if (existing[0]?.status !== "RESERVED") {
      discountOverLimit = !(await reserveDiscountUse(
        tx,
        scope,
        checkout.id,
        quote.discount,
        checkout.email,
      ));
    }
  }

  const numberRows = await tx.$queryRaw<
    { n: number | null }[]
  >`SELECT app_next_order_number() AS n`;
  const orderNumber = numberRows[0]?.n;
  if (!orderNumber) throw new Error("order number allocation failed");

  const address = checkout.shippingAddress;
  const customerRows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "Customer" (id, "organisationId", "storeId", email, "firstName", "lastName", phone,
      tags, "updatedAt")
    VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
      ${checkout.email}, ${address?.firstName ?? null}, ${address?.lastName ?? null},
      ${address?.phone ?? null}, '{}', now())
    ON CONFLICT ("storeId", email) WHERE email IS NOT NULL AND "deletedAt" IS NULL
    DO UPDATE SET "firstName" = coalesce("Customer"."firstName", EXCLUDED."firstName"),
      "lastName" = coalesce("Customer"."lastName", EXCLUDED."lastName"),
      phone = coalesce("Customer".phone, EXCLUDED.phone), "updatedAt" = now()
    RETURNING id`;
  const customerId = customerRows[0]?.id;
  if (!customerId) throw new Error("customer upsert returned no row");

  const orderId = uuidv7();
  await tx.$executeRaw`
    INSERT INTO "Order" (id, "organisationId", "storeId", "orderNumber", "checkoutId", "customerId",
      email, phone, currency, "pricesIncludeTax", "subtotalAmount", "discountAmount",
      "shippingAmount", "taxAmount", "totalAmount", status, "paymentStatus", "fulfilmentStatus",
      "stockShortage", tags, "placedAt", "updatedAt")
    VALUES (${orderId}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid, ${orderNumber},
      ${checkout.id}::uuid, ${customerId}::uuid, ${checkout.email}, ${address?.phone ?? null},
      ${quote.currency}, ${quote.pricesIncludeTax}, ${BigInt(quote.subtotal)},
      ${BigInt(quote.discountTotal)}, ${BigInt(quote.shippingTotal)}, ${BigInt(quote.taxTotal)},
      ${BigInt(quote.total)}, 'OPEN', 'PAID', 'UNFULFILLED', ${shortage}, '{}', now(), now())`;

  const lineByVariant = new Map<string, string>();
  for (const line of quote.lines) {
    const lineId = uuidv7();
    lineByVariant.set(line.variantId, lineId);
    await tx.$executeRaw`
      INSERT INTO "OrderLine" (id, "organisationId", "storeId", "orderId", "productId", "variantId",
        "productTitle", "variantTitle", sku, currency, "unitPriceAmount", quantity, "discountAmount",
        "taxAmount", "totalAmount", "requiresShipping", taxable, "weightGrams")
      VALUES (${lineId}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
        ${orderId}::uuid, ${line.productId}::uuid, ${line.variantId}::uuid, ${line.productTitle},
        ${line.variantTitle || null}, ${line.sku}, ${quote.currency}, ${BigInt(line.unitPrice)},
        ${line.quantity}, ${BigInt(line.discount)}, ${BigInt(line.tax)}, ${BigInt(line.total)},
        ${line.requiresShipping}, ${line.taxable}, ${line.weightGrams})`;
    for (const t of line.taxLines) {
      await tx.$executeRaw`
        INSERT INTO "OrderTaxLine" (id, "organisationId", "storeId", "orderId", "orderLineId", title,
          "ratePpm", currency, amount)
        VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
          ${orderId}::uuid, ${lineId}::uuid, ${t.name}, ${t.ratePpm}, ${quote.currency},
          ${BigInt(t.amount)})`;
    }
  }
  if (quote.shipping) {
    await tx.$executeRaw`
      INSERT INTO "OrderShippingLine" (id, "organisationId", "storeId", "orderId", "shippingRateId",
        title, currency, amount, "taxAmount")
      VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
        ${orderId}::uuid, ${quote.shipping.rateId}::uuid, ${quote.shipping.name}, ${quote.currency},
        ${BigInt(quote.shipping.amount)}, ${BigInt(quote.shipping.tax)})`;
    for (const t of quote.shipping.taxLines) {
      await tx.$executeRaw`
        INSERT INTO "OrderTaxLine" (id, "organisationId", "storeId", "orderId", title, "ratePpm",
          currency, amount)
        VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
          ${orderId}::uuid, ${`${t.name} (shipping)`}, ${t.ratePpm}, ${quote.currency},
          ${BigInt(t.amount)})`;
    }
  }
  if (quote.discount) {
    await tx.$executeRaw`
      INSERT INTO "OrderDiscount" (id, "organisationId", "storeId", "orderId", "discountId", code,
        title, type, "percentageBps", amount, currency)
      VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
        ${orderId}::uuid, ${quote.discount.discountId}::uuid, ${quote.discount.code},
        ${quote.discount.title}, ${quote.discount.type}::"DiscountType",
        ${quote.discount.percentageBps}, ${BigInt(quote.discount.amount)}, ${quote.currency})`;
    await tx.$executeRaw`
      UPDATE "DiscountRedemption" SET status = 'REDEEMED', "orderId" = ${orderId}::uuid,
        "customerId" = ${customerId}::uuid, "updatedAt" = now()
      WHERE "discountId" = ${quote.discount.discountId}::uuid AND "checkoutId" = ${checkout.id}::uuid`;
  }
  for (const [type, value] of [
    ["SHIPPING", checkout.shippingAddress],
    ["BILLING", checkout.billingAddress ?? checkout.shippingAddress],
  ] as const) {
    if (!value) continue;
    await tx.$executeRaw`
      INSERT INTO "OrderAddress" (id, "organisationId", "storeId", "orderId", type, "firstName",
        "lastName", company, line1, line2, city, region, "regionCode", "postalCode", "countryCode", phone)
      VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
        ${orderId}::uuid, ${type}::"AddressType", ${value.firstName}, ${value.lastName},
        ${value.company}, ${value.line1}, ${value.line2}, ${value.city}, ${value.region},
        ${value.regionCode}, ${value.postalCode}, ${value.countryCode}, ${value.phone})`;
  }

  await convertCheckoutStock(tx, checkout.id, orderId, lineByVariant);
  await tx.$executeRaw`
    UPDATE "Payment" SET "orderId" = ${orderId}::uuid, "updatedAt" = now()
    WHERE id = ${payment.id}::uuid`;
  assertCheckoutTransition(checkout.status, "COMPLETED");
  await tx.$executeRaw`
    UPDATE "Checkout" SET status = 'COMPLETED', "completedOrderId" = ${orderId}::uuid,
      "customerId" = ${customerId}::uuid, "updatedAt" = now()
    WHERE id = ${checkout.id}::uuid`;
  await tx.$executeRaw`
    UPDATE "Cart" SET status = 'CONVERTED', "updatedAt" = now()
    WHERE id = ${checkout.cartId}::uuid AND status = 'ACTIVE'`;

  await orderEvent(tx, scope, orderId, "order.placed", "Order placed from the online store.");
  await orderEvent(tx, scope, orderId, "payment.captured", "Payment captured.", {
    paymentId: payment.id,
    provider: payment.provider,
    amount: payment.amount.toString(),
  });
  if (shortage) {
    await orderEvent(
      tx,
      scope,
      orderId,
      "inventory.shortage",
      "Payment arrived after the reservation ended and stock ran short. Check stock before fulfilling.",
    );
  }
  if (discountOverLimit) {
    await orderEvent(
      tx,
      scope,
      orderId,
      "discount.over_limit",
      "Payment arrived after the reservation ended; the discount's usage limit was already reached.",
    );
  }
  await queueNotification(
    tx,
    scope,
    orderId,
    "ORDER_CONFIRMATION",
    `order-confirmation:${orderId}`,
    checkout.email,
  );

  recordMetric("checkout.order_created", 1, shortage ? { shortage: "true" } : {});
  log.info("order created", { orderId, orderNumber, paymentId: payment.id });
  return { kind: "completed", orderId, orderNumber, created: true };
}
