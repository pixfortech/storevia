// Development seed for Milestone 6: shipping, tax, discount codes, the Test
// Payment Provider and a few real orders for Acme Flagship, all created
// through the same services the dashboard and the storefront use (orders
// go through the real checkout: cart → checkout → test payment → signed
// event → order).
//
// Converges rather than runs once: each piece (the shipping zone and each
// rate, tax, each discount code, the payment connection, each seeded order
// and its fulfilment or refund) is checked on its own and only what is
// missing is created, so a rerun after a failure part-way completes the
// seed without duplicating anything.
//
// Checkout cases on http://acme-flagship.store.localhost:3002:
//   Stoneware mug (Sand)     plenty of stock: the happy path
//   Enamel saucepan          2 left: two shoppers race for the last units
//   Linen apron Charcoal L–XL  sold out: can't be added to the cart
//   WELCOME10  10% off              FLAT200  ₹200 off orders from ₹1,000
//   ONEUSE     10% off, one use     SPRING   expired     LAUNCH  starts next month
//   Shipping: India only; Standard ₹60, free from ₹1,999. Prices include 18% GST.
//   Test payments: "Pay successfully", "Decline the payment" or "Cancel";
//   refunds whose amount ends in .13 are declined by the test provider.
import {
  connectTestPayments,
  createDiscount,
  createShippingRate,
  createShippingZone,
  createTaxRate,
  fulfilOrder,
  getOrder,
  getPaymentSettings,
  getProduct,
  getShippingSettings,
  getTaxSettings,
  listDiscounts,
  listOrders,
  listProducts,
  refundOrder,
  testPaymentsSetupProblem,
  updateTaxSettings,
} from "@storevia/commerce";
import {
  applyDiscountCode,
  beginPayment,
  getCheckout,
  selectShippingRate,
  simulateTestPayment,
  startCheckout,
  updateAddress,
  updateContact,
  type CheckoutStore,
} from "@storevia/commerce/checkout";
import { addToCart } from "@storevia/commerce/storefront";
import { getStore, requireStoreAccess, type StoreContext } from "@storevia/tenancy";
import { toTypeId } from "@storevia/types";
import { ensureStoreLive } from "./seed-launch";

const ADDRESSES = [
  {
    firstName: "Asha",
    lastName: "Rao",
    line1: "12 MG Road",
    city: "Bengaluru",
    regionCode: "KA",
    postalCode: "560001",
  },
  {
    firstName: "Vikram",
    lastName: "Mehta",
    line1: "4 Marine Drive",
    city: "Mumbai",
    regionCode: "MH",
    postalCode: "400002",
  },
  {
    firstName: "Neha",
    lastName: "Iyer",
    line1: "22 Anna Salai",
    city: "Chennai",
    regionCode: "TN",
    postalCode: "600002",
  },
] as const;

async function variantOf(ctx: StoreContext, title: string, variant?: string): Promise<string> {
  const product = (await listProducts(ctx, { q: title })).items.find((p) => p.title === title);
  if (!product) throw new Error(`seed product ${title} is missing`);
  const detail = await getProduct(ctx, product.id);
  const found = variant ? detail.variants.find((v) => v.title === variant) : detail.variants[0];
  if (!found) throw new Error(`seed variant ${title} ${variant ?? ""} is missing`);
  return found.id;
}

async function placeOrder(
  store: CheckoutStore,
  lines: readonly (readonly [string, number])[],
  email: string,
  address: (typeof ADDRESSES)[number],
  code?: string,
): Promise<void> {
  const clientIp = null;
  let cartToken: string | null = null;
  for (const [variantId, quantity] of lines) {
    const result = await addToCart({ store, token: cartToken, clientIp }, { variantId, quantity });
    cartToken = result.newToken ?? cartToken;
  }
  const { token } = await startCheckout({ store, token: null, clientIp, cartToken });
  const req = { store, token, clientIp };
  await updateContact(req, { email });
  await updateAddress(req, { ...address, countryCode: "IN" });
  if (code) await applyDiscountCode(req, { code });
  const priced = await getCheckout(req);
  const rate = priced?.shippingOptions[0];
  const view = rate ? await selectShippingRate(req, { rateId: rate.id }) : priced;
  if (!view) throw new Error("seed checkout vanished");
  const started = await beginPayment(req, {
    pricingHash: view.pricingHash,
    returnUrl: "http://acme-flagship.store.localhost:3002/checkout/return",
  });
  if (started.kind !== "redirect") throw new Error(`seed payment did not start (${started.kind})`);
  await simulateTestPayment(req, new URL(started.url).searchParams.get("ref") ?? "", "captured");
}

const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();

const RATES = [
  { name: "Standard", type: "FLAT", amount: "60" },
  { name: "Free shipping", type: "PRICE_BASED", amount: "0", minSubtotal: "1999" },
] as const;

const DISCOUNTS = () =>
  [
    { code: "WELCOME10", title: "Welcome 10%", type: "PERCENTAGE", value: "10" },
    {
      code: "FLAT200",
      title: "₹200 off from ₹1,000",
      type: "FIXED_AMOUNT",
      value: "200",
      minSubtotal: "1000",
    },
    { code: "ONEUSE", title: "One-time 10%", type: "PERCENTAGE", value: "10", usageLimit: "1" },
    {
      code: "SPRING",
      title: "Spring sale (ended)",
      type: "PERCENTAGE",
      value: "15",
      startsAt: iso(-60),
      endsAt: iso(-30),
    },
    { code: "LAUNCH", title: "Launch week", type: "PERCENTAGE", value: "20", startsAt: iso(30) },
  ] as const;

/** The seeded orders, found again by their shopper's email. */
const ORDERS = [
  { email: "asha.rao@example.test", address: 0, lines: [["mug", 2]] },
  {
    email: "vikram.mehta@example.test",
    address: 1,
    lines: [
      ["towels", 1],
      ["mug", 1],
    ],
    code: "WELCOME10",
    ship: true,
  },
  { email: "neha.iyer@example.test", address: 2, lines: [["towels", 2]], refund: "100" },
] as const;

export interface CommerceSeedResult {
  /** What this run created or repaired ("" when the store was already complete). */
  readonly created: readonly string[];
  /** What couldn't be seeded here, and how to fix it; a rerun completes the rest. */
  readonly problems: readonly string[];
}

async function ensureShipping(ctx: StoreContext, created: string[]): Promise<void> {
  let zone = (await getShippingSettings(ctx)).find((z) => z.name === "India");
  if (!zone) {
    await createShippingZone(ctx, { name: "India", countries: "IN" });
    created.push("shipping zone India");
    zone = (await getShippingSettings(ctx)).find((z) => z.name === "India");
  }
  if (!zone) throw new Error("seed shipping zone is missing after creating it");
  for (const rate of RATES) {
    if (zone.rates.some((r) => r.name === rate.name)) continue;
    await createShippingRate(ctx, zone.id, rate);
    created.push(`shipping rate ${rate.name}`);
  }
}

async function ensureTax(ctx: StoreContext, created: string[]): Promise<void> {
  const tax = await getTaxSettings(ctx);
  if (tax.rates.some((r) => r.countryCode === "IN" && r.name === "GST")) return;
  await updateTaxSettings(ctx, { pricesIncludeTax: "on", chargeTaxOnShipping: "" });
  await createTaxRate(ctx, { name: "GST", countryCode: "IN", rate: "18" });
  created.push("GST 18% (prices include tax)");
}

async function ensureDiscounts(ctx: StoreContext, created: string[]): Promise<void> {
  const existing = new Set((await listDiscounts(ctx)).map((d) => d.code));
  for (const discount of DISCOUNTS()) {
    if (existing.has(discount.code)) continue;
    await createDiscount(ctx, discount);
    created.push(`discount ${discount.code}`);
  }
}

/** Connects test payments unless the store already takes payments; returns a problem or null. */
async function ensurePayments(ctx: StoreContext, created: string[]): Promise<string | null> {
  const settings = await getPaymentSettings(ctx);
  if (settings.connections.some((c) => c.status === "ACTIVE" && c.usable)) return null;
  const problem = testPaymentsSetupProblem();
  if (problem) return `Test payments not connected. ${problem}`;
  await connectTestPayments(ctx);
  created.push("test payments connection");
  return null;
}

async function ensureOrders(ctx: StoreContext, created: string[]): Promise<void> {
  const s = await getStore(ctx);
  const store: CheckoutStore = {
    organisationId: ctx.organisationId,
    storeId: ctx.storeId,
    currency: s.currency,
    name: s.name,
  };
  const variants = {
    mug: await variantOf(ctx, "Stoneware mug", "Sand"),
    towels: await variantOf(ctx, "Cotton tea towels, set of 2"),
  };
  for (const seeded of ORDERS) {
    const find = async () =>
      (await listOrders(ctx, { q: seeded.email })).items.find((o) => o.email === seeded.email);
    let order = await find();
    if (!order) {
      const address = ADDRESSES[seeded.address];
      await placeOrder(
        store,
        seeded.lines.map(([key, quantity]) => [variants[key], quantity] as const),
        seeded.email,
        address,
        "code" in seeded ? seeded.code : undefined,
      );
      created.push(`order for ${seeded.email}`);
      order = await find();
    }
    if (!order) throw new Error(`seed order for ${seeded.email} is missing after placing it`);
    const detail = await getOrder(ctx, order.id);
    if ("ship" in seeded && detail.fulfilments.length === 0) {
      await fulfilOrder(ctx, order.id, {
        trackingCompany: "India Post",
        trackingNumber: "EM123456789IN",
        trackingUrl: "https://www.indiapost.gov.in/",
      });
      created.push(`shipment of #${String(order.number)}`);
    }
    if ("refund" in seeded && detail.refunds.length === 0) {
      // Refunds need a recent password confirmation (M8); the seed acts as
      // the owner having just confirmed theirs.
      const confirmed = await requireStoreAccess(
        { ...ctx.principal, recentlyAuthenticated: true },
        toTypeId("store", ctx.storeId),
      );
      await refundOrder(confirmed, order.id, {
        amount: seeded.refund,
        reason: "Box arrived damaged",
      });
      created.push(`refund on #${String(order.number)}`);
    }
  }
}

/**
 * Brings Acme Flagship's commerce set-up to the seeded state, creating only
 * what is missing. Orders need a payment connection, so without one they are
 * left for a rerun and the reason is returned in `problems`.
 */
export async function seedAcmeCommerce(ctx: StoreContext): Promise<CommerceSeedResult> {
  const created: string[] = [];
  const problems: string[] = [];
  await ensureShipping(ctx, created);
  await ensureTax(ctx, created);
  await ensureDiscounts(ctx, created);
  const payments = await ensurePayments(ctx, created);
  if (payments) {
    problems.push(payments, "Seeded orders are skipped until payments are connected.");
  } else {
    // The flagship is live, so local development shows a working store (M4).
    await ensureStoreLive(ctx, "help@acme.example");
    await ensureOrders(ctx, created);
  }
  return { created, problems };
}
