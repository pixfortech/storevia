import "server-only";
import { withCheckout, checkoutDb, type CheckoutScope } from "@storevia/database/checkout";
import type { TenantTx } from "@storevia/database";
import { createLogger, errorFields, recordMetric } from "@storevia/observability";
import { PaymentProviderError } from "@storevia/payments";
import { consumeRateLimitsWith, type RateLimitRule } from "@storevia/security/rate-limit";
import {
  DomainError,
  isDomainError,
  parseTypeId,
  toTypeId,
  uuidv7,
  validationFailed,
} from "@storevia/types";
import { hashCartToken } from "../storefront/cart";
import { applyPaymentOutcome, endAttempt, lockPendingPayment, reserveDiscountUse } from "./confirm";
import { acceptsCurrency, activeConnection, connectionById, openConnection } from "./connection";
import { parseAddress, parseDiscountCode, parseEmail } from "./input";
import { loadCheckout, loadPricingInput, repriceCheckout, type CheckoutRow } from "./load";
import {
  describeQuoteChange,
  parseStoredQuote,
  priceCheckout,
  type CheckoutAddress,
  type CheckoutProblem,
  type DiscountProblem,
  type PriceQuote,
  type QuoteChange,
} from "./pricing";
import { assertCheckoutTransition } from "./state";
import { reserveStock } from "./stock";
import { CHECKOUT_LIMITS, hashCheckoutToken, isCheckoutToken, newCheckoutToken } from "./tokens";

// The shopper's checkout (ADR-0031 §1): guest only, server-authoritative,
// started from the cart. Every call is identified by the checkout token
// from the host-only cookie and scoped to the store the host resolved;
// nothing the browser sends is trusted beyond its shape. Each step
// re-prices and stores the quote; payment re-prices once more and must
// match the hash the shopper reviewed.

const log = createLogger({ component: "checkout" });

export interface CheckoutStore {
  readonly organisationId: string;
  readonly storeId: string;
  readonly currency: string;
  readonly name: string;
}

export interface CheckoutRequest {
  readonly store: CheckoutStore;
  /** The checkout cookie's value, if any (never trusted beyond its hash). */
  readonly token: string | null;
  /** For rate limiting; null when unknown. */
  readonly clientIp: string | null;
}

const RULES = {
  start: { name: "checkout:start", limit: 20, windowSeconds: 60 },
  step: { name: "checkout:step", limit: 90, windowSeconds: 60 },
  discount: { name: "checkout:discount", limit: 10, windowSeconds: 60 },
  pay: { name: "checkout:pay", limit: 10, windowSeconds: 60 },
  confirm: { name: "checkout:confirm", limit: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

async function rateLimit(
  store: CheckoutStore,
  clientIp: string | null,
  ...rules: readonly RateLimitRule[]
): Promise<void> {
  const result = await consumeRateLimitsWith(
    checkoutDb(),
    rules.map((rule) => [rule, clientIp ? `${store.storeId}:${clientIp}` : null] as const),
  );
  if (!result.allowed) {
    throw new DomainError("RATE_LIMITED", "Too many attempts. Please wait a moment and try again.");
  }
}

const scopeOf = (store: CheckoutStore, extra: Partial<CheckoutScope> = {}): CheckoutScope => ({
  organisationId: store.organisationId,
  storeId: store.storeId,
  ...extra,
});

const stockScope = (store: CheckoutStore) => ({
  organisationId: store.organisationId,
  storeId: store.storeId,
});

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface MoneyDto {
  readonly amount: string;
  readonly currency: string;
}

export interface CheckoutLineView {
  readonly variantId: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly quantity: number;
  readonly unitPrice: MoneyDto;
  readonly subtotal: MoneyDto;
  readonly discount: MoneyDto;
}

export interface CheckoutShippingOptionView {
  readonly id: string;
  readonly name: string;
  readonly amount: MoneyDto;
  readonly selected: boolean;
}

export type CheckoutStage = "open" | "paying" | "completed" | "expired";

export interface CheckoutView {
  readonly stage: CheckoutStage;
  readonly email: string | null;
  readonly shippingAddress: CheckoutAddress | null;
  readonly billingAddress: CheckoutAddress | null;
  readonly lines: readonly CheckoutLineView[];
  readonly unavailable: readonly {
    readonly productTitle: string;
    readonly variantTitle: string;
    readonly quantity: number;
    readonly reason: "UNAVAILABLE" | "SOLD_OUT" | "LOW_STOCK";
    /** For LOW_STOCK: how many can be had. */
    readonly available: number | null;
  }[];
  readonly requiresShipping: boolean;
  readonly shippingOptions: readonly CheckoutShippingOptionView[];
  readonly shipping: { readonly name: string; readonly amount: MoneyDto } | null;
  readonly discount: {
    readonly code: string;
    readonly title: string;
    readonly amount: MoneyDto;
  } | null;
  readonly discountCode: string | null;
  readonly discountProblem: DiscountProblem | null;
  readonly taxLines: readonly { readonly name: string; readonly amount: MoneyDto }[];
  readonly pricesIncludeTax: boolean;
  readonly subtotal: MoneyDto;
  readonly discountTotal: MoneyDto;
  readonly shippingTotal: MoneyDto;
  readonly taxTotal: MoneyDto;
  readonly total: MoneyDto;
  readonly problems: readonly CheckoutProblem[];
  /** Hash of the quote shown; beginPayment must receive it back. */
  readonly pricingHash: string;
  /** The store can take payment right now. */
  readonly paymentsAvailable: boolean;
  /** The provider page of an attempt in flight. */
  readonly paymentRedirectUrl: string | null;
  /** Why the last attempt ended without payment, if it did. */
  readonly lastPaymentProblem: "DECLINED" | "CANCELLED" | "ERROR" | null;
  readonly order: { readonly number: number } | null;
  /** Countries the store ships to (ISO codes), for the address form. */
  readonly shippingCountries: readonly string[];
}

const m = (amount: string, currency: string): MoneyDto => ({ amount, currency });

function view(
  checkout: CheckoutRow,
  quote: PriceQuote,
  hash: string,
  extra: {
    readonly paymentsAvailable: boolean;
    readonly redirectUrl: string | null;
    readonly lastProblem: CheckoutView["lastPaymentProblem"];
    readonly orderNumber: number | null;
    readonly shippingCountries: readonly string[];
  },
): CheckoutView {
  const c = quote.currency;
  const stage: CheckoutStage =
    checkout.status === "COMPLETED"
      ? "completed"
      : checkout.status === "EXPIRED" || (checkout.status === "OPEN" && checkout.expired)
        ? "expired"
        : checkout.status === "PAYMENT_PENDING"
          ? "paying"
          : "open";
  return {
    stage,
    email: checkout.email,
    shippingAddress: checkout.shippingAddress,
    billingAddress: checkout.billingAddress,
    lines: quote.lines.map((l) => ({
      variantId: toTypeId("variant", l.variantId),
      productTitle: l.productTitle,
      variantTitle: l.variantTitle,
      quantity: l.quantity,
      unitPrice: m(l.unitPrice, c),
      subtotal: m(l.subtotal, c),
      discount: m(l.discount, c),
    })),
    unavailable: quote.unavailable.map((u) => ({
      productTitle: u.productTitle,
      variantTitle: u.variantTitle,
      quantity: u.quantity,
      reason: u.reason,
      available: u.available ?? null,
    })),
    requiresShipping: quote.requiresShipping,
    shippingOptions: quote.shippingOptions.map((o) => ({
      id: toTypeId("shippingRate", o.rateId),
      name: o.name,
      amount: m(o.amount, c),
      selected: quote.shipping?.rateId === o.rateId,
    })),
    shipping: quote.shipping
      ? { name: quote.shipping.name, amount: m(quote.shipping.amount, c) }
      : null,
    discount: quote.discount
      ? {
          code: quote.discount.code,
          title: quote.discount.title,
          amount: m(quote.discount.amount, c),
        }
      : null,
    discountCode: quote.discountCode,
    discountProblem: quote.discountProblem,
    taxLines: quote.taxLines.map((t) => ({ name: t.name, amount: m(t.amount, c) })),
    pricesIncludeTax: quote.pricesIncludeTax,
    subtotal: m(quote.subtotal, c),
    discountTotal: m(quote.discountTotal, c),
    shippingTotal: m(quote.shippingTotal, c),
    taxTotal: m(quote.taxTotal, c),
    total: m(quote.total, c),
    problems: quote.problems,
    pricingHash: hash,
    paymentsAvailable: extra.paymentsAvailable,
    paymentRedirectUrl: extra.redirectUrl,
    lastPaymentProblem: extra.lastProblem,
    order: extra.orderNumber === null ? null : { number: extra.orderNumber },
    shippingCountries: extra.shippingCountries,
  };
}

async function paymentsAvailable(tx: TenantTx, currency: string): Promise<boolean> {
  const row = await activeConnection(tx);
  if (!row) return false;
  try {
    const open = openConnection(row);
    return open !== null && acceptsCurrency(open.provider, currency);
  } catch {
    return false;
  }
}

async function buildView(
  tx: TenantTx,
  store: CheckoutStore,
  checkout: CheckoutRow,
): Promise<CheckoutView> {
  // Only an open checkout is re-priced; otherwise the stored quote is what
  // was (or is being) paid.
  let quote: PriceQuote | null;
  let hash: string;
  if (checkout.status === "OPEN" && !checkout.expired) {
    const priced = await repriceCheckout(tx, checkout, store.currency);
    quote = priced.quote;
    hash = priced.hash;
  } else {
    quote = parseStoredQuote(checkout.quote);
    hash = checkout.pricingHash ?? "";
  }
  if (!quote) throw new DomainError("NOT_FOUND", "This checkout is no longer available.");

  const attempts = await tx.$queryRaw<
    { status: string; redirect: string | null; code: string | null }[]
  >`
    SELECT status::text AS status, "redirectUrl" AS redirect, "failureCode" AS code
    FROM "Payment" ORDER BY "createdAt" DESC, id DESC LIMIT 1`;
  const last = attempts[0];
  const lastProblem: CheckoutView["lastPaymentProblem"] =
    checkout.status !== "OPEN" || !last || last.status === "PENDING" || last.status === "CAPTURED"
      ? null
      : last.status === "CANCELLED" && last.code !== "PROVIDER_ERROR"
        ? "CANCELLED"
        : last.code === "PROVIDER_ERROR"
          ? "ERROR"
          : "DECLINED";
  let orderNumber: number | null = null;
  if (checkout.completedOrderId) {
    const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT "orderNumber" AS n FROM "Order" WHERE id = ${checkout.completedOrderId}::uuid`;
    orderNumber = rows[0]?.n ?? null;
  }
  const countries = await tx.$queryRaw<{ code: string }[]>`
    SELECT DISTINCT trim(c."countryCode") AS code FROM "ShippingZoneCountry" c
    WHERE EXISTS (SELECT 1 FROM "ShippingRate" r WHERE r."zoneId" = c."zoneId" AND r.active)
    ORDER BY 1`;
  return view(checkout, quote, hash, {
    shippingCountries: countries.map((c) => c.code),
    paymentsAvailable:
      checkout.status === "OPEN" ? await paymentsAvailable(tx, store.currency) : false,
    redirectUrl: checkout.status === "PAYMENT_PENDING" ? (last?.redirect ?? null) : null,
    lastProblem,
    orderNumber,
  });
}

/** Scopes a transaction to the checkout named by the token (or returns null). */
async function inCheckout<T>(
  req: CheckoutRequest,
  lock: boolean,
  fn: (tx: TenantTx, checkout: CheckoutRow) => Promise<T>,
): Promise<T | null> {
  if (!isCheckoutToken(req.token)) return null;
  const tokenHash = hashCheckoutToken(req.token);
  return withCheckout(
    scopeOf(req.store, { checkoutTokenHash: tokenHash }),
    async (tx, setCheckout) => {
      const found = await loadCheckout(tx, { tokenHash }, lock);
      if (!found) return null;
      await setCheckout(found.id);
      return fn(tx, found);
    },
  );
}

const gone = () =>
  new DomainError(
    "NOT_FOUND",
    "This checkout is no longer available. Please start again from your cart.",
  );

// ---------------------------------------------------------------------------
// Starting and reading
// ---------------------------------------------------------------------------

export interface StartResult {
  /** The checkout token to set as the cookie (the existing one when it was reused). */
  readonly token: string;
}

/**
 * Starts checkout from the shopper's cart. An open, unexpired checkout of
 * the same cart held by this browser is reused; a missing or foreign cart
 * is "empty".
 */
export async function startCheckout(
  req: CheckoutRequest & { readonly cartToken: string | null },
): Promise<StartResult> {
  await rateLimit(req.store, req.clientIp, RULES.start);
  const cartTokenHash =
    req.cartToken && /^[A-Za-z0-9_-]{43}$/.test(req.cartToken)
      ? hashCartToken(req.cartToken)
      : null;
  const empty = () => new DomainError("CONFLICT", "Your cart is empty.");
  if (!cartTokenHash) throw empty();
  const tokenHash = isCheckoutToken(req.token) ? hashCheckoutToken(req.token) : null;
  return withCheckout(
    scopeOf(req.store, { cartTokenHash, checkoutTokenHash: tokenHash }),
    async (tx, setCheckout) => {
      const carts = await tx.$queryRaw<{ id: string; lines: number }[]>`
        SELECT c.id, (SELECT count(*)::int FROM "CartLine" l WHERE l."cartId" = c.id) AS lines
        FROM "Cart" c
        WHERE c."tokenHash" = ${cartTokenHash} AND c.status = 'ACTIVE' AND c."expiresAt" > now()
        FOR UPDATE`;
      const cart = carts[0];
      if (!cart || cart.lines === 0) throw empty();
      if (tokenHash && req.token) {
        const existing = await loadCheckout(tx, { tokenHash }, true);
        if (
          existing?.cartId === cart.id &&
          (existing.status === "PAYMENT_PENDING" ||
            (existing.status === "OPEN" && !existing.expired))
        ) {
          return { token: req.token };
        }
      }
      const token = newCheckoutToken();
      const id = uuidv7();
      await tx.$executeRaw`
        INSERT INTO "Checkout" (id, "organisationId", "storeId", "cartId", "tokenHash", currency,
          "expiresAt", "updatedAt")
        VALUES (${id}::uuid, ${req.store.organisationId}::uuid, ${req.store.storeId}::uuid,
          ${cart.id}::uuid, ${hashCheckoutToken(token)}, ${req.store.currency},
          now() + make_interval(mins => ${CHECKOUT_LIMITS.ttlMinutes}), now())`;
      await setCheckout(id);
      const checkout = await loadCheckout(tx, { id }, false);
      if (checkout) {
        // A cart with a line that can't be bought as it is (sold out, more than
        // stock can supply, no longer sold) is fixed in the cart first.
        const { quote } = await repriceCheckout(tx, checkout, req.store.currency);
        if (quote.unavailable.length > 0) {
          throw new DomainError(
            "CONFLICT",
            "Some items in your cart can't be bought as they are. Update your cart to continue.",
          );
        }
      }
      recordMetric("checkout.started");
      return { token };
    },
  );
}

/** The shopper's checkout, re-priced when open; null without a valid token. */
export async function getCheckout(req: CheckoutRequest): Promise<CheckoutView | null> {
  return inCheckout(req, true, (tx, checkout) => buildView(tx, req.store, checkout));
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function step(
  req: CheckoutRequest,
  rules: readonly RateLimitRule[],
  change: (tx: TenantTx, checkout: CheckoutRow) => Promise<void>,
): Promise<CheckoutView> {
  await rateLimit(req.store, req.clientIp, ...rules);
  const result = await inCheckout(req, true, async (tx, checkout) => {
    if (checkout.status === "COMPLETED") {
      throw new DomainError("CONFLICT", "This order has already been placed.");
    }
    if (checkout.status === "PAYMENT_PENDING") {
      throw new DomainError(
        "CONFLICT",
        "A payment is in progress. Finish it, or cancel it to change your details.",
      );
    }
    if (checkout.status === "EXPIRED" || checkout.expired) {
      throw new DomainError(
        "CONFLICT",
        "This checkout has expired. Please start again from your cart.",
      );
    }
    await change(tx, checkout);
    await tx.$executeRaw`
      UPDATE "Checkout"
      SET "expiresAt" = now() + make_interval(mins => ${CHECKOUT_LIMITS.ttlMinutes}), "updatedAt" = now()
      WHERE id = ${checkout.id}::uuid`;
    const fresh = await loadCheckout(tx, { id: checkout.id }, false);
    if (!fresh) throw gone();
    return buildView(tx, req.store, fresh);
  });
  if (!result) throw gone();
  return result;
}

export async function updateContact(
  req: CheckoutRequest,
  input: { readonly email: unknown },
): Promise<CheckoutView> {
  const email = parseEmail(input.email);
  return step(req, [RULES.step], async (tx, checkout) => {
    await tx.$executeRaw`UPDATE "Checkout" SET email = ${email} WHERE id = ${checkout.id}::uuid`;
  });
}

/**
 * Sets the shipping address, and the billing address (the same unless
 * `billingSameAsShipping` is off and billing fields are given, prefixed
 * "billing_"). A shipping rate that no longer applies is cleared by pricing.
 */
export async function updateAddress(
  req: CheckoutRequest,
  input: Readonly<Record<string, unknown>>,
): Promise<CheckoutView> {
  const separateBilling =
    input["billingSameAsShipping"] === "off" || input["billingSameAsShipping"] === false;
  // Both addresses are checked before either error is reported, so the
  // shopper sees every field to correct at once.
  const errors: Record<string, string> = {};
  const parse = (prefix: string): CheckoutAddress | null => {
    try {
      return parseAddress(input, prefix);
    } catch (error) {
      if (!isDomainError(error) || !error.fieldErrors) throw error;
      Object.assign(errors, error.fieldErrors);
      return null;
    }
  };
  const shipping = parse("");
  const billing = separateBilling ? parse("billing_") : shipping;
  if (!shipping || !billing) throw validationFailed(errors);
  return step(req, [RULES.step], async (tx, checkout) => {
    await tx.$executeRaw`
      UPDATE "Checkout" SET "shippingAddress" = ${JSON.stringify(shipping)}::jsonb,
        "billingAddress" = ${JSON.stringify(billing)}::jsonb
      WHERE id = ${checkout.id}::uuid`;
    // A chosen method that doesn't serve the new address is cleared, so it
    // can't quietly come back if the address changes again.
    if (checkout.shippingRateId) {
      const quote = priceCheckout(
        await loadPricingInput(tx, { ...checkout, shippingAddress: shipping }, req.store.currency),
      );
      if (!quote.shippingOptions.some((o) => o.rateId === checkout.shippingRateId)) {
        await tx.$executeRaw`
          UPDATE "Checkout" SET "shippingRateId" = NULL WHERE id = ${checkout.id}::uuid`;
      }
    }
  });
}

export async function selectShippingRate(
  req: CheckoutRequest,
  input: { readonly rateId: unknown },
): Promise<CheckoutView> {
  const rateId =
    typeof input.rateId === "string" ? parseTypeId("shippingRate", input.rateId) : null;
  if (!rateId) throw validationFailed({ rateId: "Choose a shipping method." });
  return step(req, [RULES.step], async (tx, checkout) => {
    const priced = await repriceCheckout(tx, checkout, req.store.currency);
    if (!priced.quote.shippingOptions.some((o) => o.rateId === rateId)) {
      throw validationFailed({ rateId: "That shipping method isn't available for your address." });
    }
    await tx.$executeRaw`
      UPDATE "Checkout" SET "shippingRateId" = ${rateId}::uuid WHERE id = ${checkout.id}::uuid`;
  });
}

const DISCOUNT_MESSAGES: Readonly<Record<DiscountProblem, string>> = {
  NOT_FOUND: "That code isn't valid.",
  NOT_STARTED: "That code isn't active yet.",
  EXPIRED: "That code has expired.",
  USED_UP: "That code has reached its usage limit.",
  MINIMUM: "Your order doesn't reach this code's minimum yet.",
};

export async function applyDiscountCode(
  req: CheckoutRequest,
  input: { readonly code: unknown },
): Promise<CheckoutView> {
  const code = parseDiscountCode(input.code);
  return step(req, [RULES.step, RULES.discount], async (tx, checkout) => {
    await tx.$executeRaw`UPDATE "Checkout" SET "discountCode" = ${code} WHERE id = ${checkout.id}::uuid`;
    const priced = await repriceCheckout(
      tx,
      { ...checkout, discountCode: code },
      req.store.currency,
    );
    if (priced.quote.discountProblem) {
      // Throwing rolls the code back: an invalid code is never stored.
      throw validationFailed({ code: DISCOUNT_MESSAGES[priced.quote.discountProblem] });
    }
  });
}

export async function removeDiscountCode(req: CheckoutRequest): Promise<CheckoutView> {
  return step(req, [RULES.step], async (tx, checkout) => {
    await tx.$executeRaw`UPDATE "Checkout" SET "discountCode" = NULL WHERE id = ${checkout.id}::uuid`;
  });
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export type BeginPaymentResult =
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "completed" }
  /** Another request is creating the attempt right now. */
  | { readonly kind: "processing" }
  /** The quote isn't what the shopper reviewed, or isn't ready: show the checkout again. */
  | { readonly kind: "changed"; readonly change: QuoteChange | "NOT_READY" };

class Rollback extends Error {
  constructor(readonly result: BeginPaymentResult) {
    super("rollback");
  }
}

/**
 * Starts a payment attempt for the quote the shopper reviewed
 * (`pricingHash`). Stock and the discount use are reserved and the attempt
 * recorded before the provider is called; the provider call happens outside
 * the transaction, and a failure there ends the attempt and releases both.
 * `returnUrl` is this store's checkout return page on the host the shopper
 * is using (the provider appends its own parameters).
 */
export async function beginPayment(
  req: CheckoutRequest,
  input: { readonly pricingHash: unknown; readonly returnUrl: string },
): Promise<BeginPaymentResult> {
  await rateLimit(req.store, req.clientIp, RULES.pay);
  const confirmed = typeof input.pricingHash === "string" ? input.pricingHash : "";
  let started: {
    paymentId: string;
    amount: bigint;
    email: string | null;
    expiresAt: Date;
    connectionId: string;
    checkoutId: string;
  };
  try {
    const outcome = await inCheckout(req, true, async (tx, checkout) => {
      if (checkout.status === "COMPLETED") return { kind: "completed" } as const;
      if (checkout.status === "PAYMENT_PENDING") {
        const pending = await lockPendingPayment(tx);
        return pending?.redirectUrl
          ? ({ kind: "redirect", url: pending.redirectUrl } as const)
          : ({ kind: "processing" } as const);
      }
      if (checkout.status === "EXPIRED" || checkout.expired) {
        throw new DomainError(
          "CONFLICT",
          "This checkout has expired. Please start again from your cart.",
        );
      }
      const cart = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM "Cart" WHERE id = ${checkout.cartId}::uuid`;
      if (cart[0]?.status !== "ACTIVE") {
        throw new DomainError("CONFLICT", "This cart has already been checked out.");
      }
      const previous = parseStoredQuote(checkout.quote);
      const { quote, hash } = await repriceCheckout(tx, checkout, req.store.currency);
      // What changed since the review says more than "not ready" (e.g. an item
      // sold out under the shopper); either way nothing is charged.
      if (hash !== confirmed) {
        return {
          kind: "changed",
          change: describeQuoteChange(previous, quote) ?? "PRICE_CHANGED",
        } as const;
      }
      if (quote.problems.length > 0) return { kind: "changed", change: "NOT_READY" } as const;

      const connection = await activeConnection(tx);
      const open = connection ? openConnection(connection) : null;
      if (!connection || !open || !acceptsCurrency(open.provider, quote.currency)) {
        throw new DomainError("CONFLICT", "This store isn't accepting payments right now.");
      }

      const expiresAt = new Date(Date.now() + CHECKOUT_LIMITS.paymentTtlMinutes * 60_000);
      const stock = await reserveStock(
        tx,
        stockScope(req.store),
        checkout.id,
        quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        expiresAt,
      );
      if (!stock.ok) throw new Rollback({ kind: "changed", change: "ITEM_UNAVAILABLE" });
      if (
        quote.discount &&
        !(await reserveDiscountUse(
          tx,
          stockScope(req.store),
          checkout.id,
          quote.discount,
          checkout.email,
        ))
      ) {
        throw new Rollback({ kind: "changed", change: "DISCOUNT_CHANGED" });
      }

      const attempts = await tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM "Payment"`;
      const paymentId = uuidv7();
      const amount = BigInt(quote.total);
      await tx.$executeRaw`
        INSERT INTO "Payment" (id, "organisationId", "storeId", "connectionId", "checkoutId", provider,
          status, currency, amount, "idempotencyKey", "expiresAt", "updatedAt")
        VALUES (${paymentId}::uuid, ${req.store.organisationId}::uuid, ${req.store.storeId}::uuid,
          ${connection.id}::uuid, ${checkout.id}::uuid, ${connection.provider}, 'PENDING',
          ${quote.currency}, ${amount}, ${`${checkout.id}:${String((attempts[0]?.n ?? 0) + 1)}`},
          ${expiresAt}, now())`;
      assertCheckoutTransition(checkout.status, "PAYMENT_PENDING");
      await tx.$executeRaw`
        UPDATE "Checkout" SET status = 'PAYMENT_PENDING',
          "expiresAt" = now() + make_interval(mins => ${CHECKOUT_LIMITS.ttlMinutes}), "updatedAt" = now()
        WHERE id = ${checkout.id}::uuid`;
      return {
        kind: "started",
        paymentId,
        amount,
        email: checkout.email,
        expiresAt,
        connectionId: connection.id,
        checkoutId: checkout.id,
      } as const;
    });
    if (!outcome) throw gone();
    if (outcome.kind !== "started") return outcome;
    started = outcome;
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    throw error;
  }

  // The provider call, outside any transaction.
  const scope = scopeOf(req.store, { checkoutId: started.checkoutId });
  let created: { providerPaymentId: string; redirectUrl: string } | null = null;
  let failure: unknown = null;
  try {
    const connection = await withCheckout(scope, (tx) => connectionById(tx, started.connectionId));
    const open = connection ? openConnection(connection) : null;
    if (!open) throw new PaymentProviderError("connection unavailable", false);
    created = await open.provider.createPayment(open.credentials, {
      reference: toTypeId("payment", started.paymentId),
      amount: started.amount,
      currency: req.store.currency,
      description: `Order at ${req.store.name}`.slice(0, 200),
      customerEmail: started.email,
      returnUrl: input.returnUrl,
      expiresAt: started.expiresAt,
    });
  } catch (error) {
    failure = error;
  }

  return withCheckout(scope, async (tx) => {
    const checkout = await loadCheckout(tx, { id: started.checkoutId }, true);
    const payment = await lockPendingPayment(tx);
    if (!checkout || payment?.id !== started.paymentId) {
      // The attempt ended meanwhile (e.g. the sweep): the shopper reviews again.
      return { kind: "changed", change: "PRICE_CHANGED" } as const;
    }
    if (!created) {
      log.warn("payment start failed", { paymentId: started.paymentId, ...errorFields(failure) });
      recordMetric("checkout.payment_start_failed");
      await endAttempt(tx, stockScope(req.store), checkout, payment, "FAILED", {
        code: "PROVIDER_ERROR",
        message: "The payment provider couldn't start the payment.",
      });
      throw new DomainError("CONFLICT", "We couldn't start the payment. Please try again.");
    }
    await tx.$executeRaw`
      UPDATE "Payment" SET "providerPaymentId" = ${created.providerPaymentId},
        "redirectUrl" = ${created.redirectUrl}, "updatedAt" = now()
      WHERE id = ${payment.id}::uuid`;
    recordMetric("checkout.payment_started");
    return { kind: "redirect", url: created.redirectUrl } as const;
  });
}

/**
 * Asks the provider about the attempt in flight and applies its answer
 * (the return page, and "check again"). The redirect itself proves
 * nothing; only the provider's server-side answer does.
 */
export async function confirmPayment(req: CheckoutRequest): Promise<CheckoutView | null> {
  await rateLimit(req.store, req.clientIp, RULES.confirm);
  const pending = await inCheckout(req, false, async (tx, checkout) => {
    if (checkout.status !== "PAYMENT_PENDING") return null;
    const rows = await tx.$queryRaw<{ provider: string; ref: string | null; connection: string }[]>`
      SELECT provider, "providerPaymentId" AS ref, "connectionId" AS connection
      FROM "Payment" WHERE status = 'PENDING'`;
    const row = rows[0];
    if (!row?.ref) return null;
    const connection = await connectionById(tx, row.connection);
    return connection
      ? { checkoutId: checkout.id, ref: row.ref, provider: row.provider, connection }
      : null;
  });
  if (pending) {
    const open = openConnection(pending.connection);
    if (open) {
      try {
        const state = await open.provider.getPayment(open.credentials, pending.ref);
        await withCheckout(scopeOf(req.store, { checkoutId: pending.checkoutId }), (tx) =>
          applyPaymentOutcome(
            tx,
            stockScope(req.store),
            pending.checkoutId,
            state,
            pending.provider,
          ),
        );
      } catch (error) {
        // The webhook (or the next check) will settle it.
        log.warn("payment status check failed", errorFields(error));
      }
    }
  }
  return getCheckout(req);
}

/**
 * Cancels the attempt in flight so the shopper can change their details.
 * The provider is asked first: money already taken completes the order
 * instead.
 */
export async function cancelPayment(req: CheckoutRequest): Promise<CheckoutView> {
  await rateLimit(req.store, req.clientIp, RULES.step);
  const pending = await inCheckout(req, false, async (tx, checkout) => {
    if (checkout.status !== "PAYMENT_PENDING") return { checkoutId: checkout.id, row: null };
    const rows = await tx.$queryRaw<{ provider: string; ref: string | null; connection: string }[]>`
      SELECT provider, "providerPaymentId" AS ref, "connectionId" AS connection
      FROM "Payment" WHERE status = 'PENDING'`;
    const row = rows[0] ?? null;
    const connection = row ? await connectionById(tx, row.connection) : null;
    return { checkoutId: checkout.id, row: row && connection ? { ...row, connection } : null };
  });
  if (!pending) throw gone();
  const scope = scopeOf(req.store, { checkoutId: pending.checkoutId });
  if (pending.row?.ref) {
    const open = openConnection(pending.row.connection);
    if (open) {
      const state = await open.provider.getPayment(open.credentials, pending.row.ref);
      if (state.status === "captured") {
        await withCheckout(scope, (tx) =>
          applyPaymentOutcome(
            tx,
            stockScope(req.store),
            pending.checkoutId,
            state,
            pending.row?.provider ?? "",
          ),
        );
        const current = await getCheckout(req);
        if (!current) throw gone();
        return current;
      }
      await open.provider.cancelPayment(open.credentials, pending.row.ref);
    }
  }
  await withCheckout(scope, async (tx) => {
    const checkout = await loadCheckout(tx, { id: pending.checkoutId }, true);
    const payment = await lockPendingPayment(tx);
    if (checkout && payment) {
      await endAttempt(tx, stockScope(req.store), checkout, payment, "CANCELLED", {
        code: "CANCELLED_BY_SHOPPER",
        message: null,
      });
    }
  });
  const current = await getCheckout(req);
  if (!current) throw gone();
  return current;
}
