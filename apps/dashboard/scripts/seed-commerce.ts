// Development seed for Milestone 6: shipping, tax, discount codes, the Test
// Payment Provider and a few real orders for Acme Flagship, all created
// through the same services the dashboard and the storefront use (orders
// go through the real checkout: cart → checkout → test payment → signed
// event → order). Idempotent: skipped when the store already has shipping.
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
  getProduct,
  getShippingSettings,
  listOrders,
  listProducts,
  refundOrder,
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
import { getStore, type StoreContext } from "@storevia/tenancy";

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

export async function seedAcmeCommerce(ctx: StoreContext): Promise<boolean> {
  if ((await getShippingSettings(ctx)).length > 0) return false;
  const { zoneId } = await createShippingZone(ctx, { name: "India", countries: "IN" });
  await createShippingRate(ctx, zoneId, { name: "Standard", type: "FLAT", amount: "60" });
  await createShippingRate(ctx, zoneId, {
    name: "Free shipping",
    type: "PRICE_BASED",
    amount: "0",
    minSubtotal: "1999",
  });
  await updateTaxSettings(ctx, { pricesIncludeTax: "on", chargeTaxOnShipping: "" });
  await createTaxRate(ctx, { name: "GST", countryCode: "IN", rate: "18" });

  const day = 24 * 60 * 60 * 1000;
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
  await createDiscount(ctx, {
    code: "WELCOME10",
    title: "Welcome 10%",
    type: "PERCENTAGE",
    value: "10",
  });
  await createDiscount(ctx, {
    code: "FLAT200",
    title: "₹200 off from ₹1,000",
    type: "FIXED_AMOUNT",
    value: "200",
    minSubtotal: "1000",
  });
  await createDiscount(ctx, {
    code: "ONEUSE",
    title: "One-time 10%",
    type: "PERCENTAGE",
    value: "10",
    usageLimit: "1",
  });
  await createDiscount(ctx, {
    code: "SPRING",
    title: "Spring sale (ended)",
    type: "PERCENTAGE",
    value: "15",
    startsAt: iso(-60),
    endsAt: iso(-30),
  });
  await createDiscount(ctx, {
    code: "LAUNCH",
    title: "Launch week",
    type: "PERCENTAGE",
    value: "20",
    startsAt: iso(30),
  });
  await connectTestPayments(ctx);

  const s = await getStore(ctx);
  const store: CheckoutStore = {
    organisationId: ctx.organisationId,
    storeId: ctx.storeId,
    currency: s.currency,
    name: s.name,
  };
  const mug = await variantOf(ctx, "Stoneware mug", "Sand");
  const towels = await variantOf(ctx, "Cotton tea towels, set of 2");
  const [a1, a2, a3] = ADDRESSES;
  await placeOrder(store, [[mug, 2]], "asha.rao@example.test", a1);
  await placeOrder(
    store,
    [
      [towels, 1],
      [mug, 1],
    ],
    "vikram.mehta@example.test",
    a2,
    "WELCOME10",
  );
  await placeOrder(store, [[towels, 2]], "neha.iyer@example.test", a3);

  // The second order has shipped; the third was partly refunded.
  const orders = (await listOrders(ctx, {})).items;
  const byNumber = (n: number) => orders.find((o) => o.number === n)?.id;
  const shipped = byNumber(1002);
  if (shipped) {
    await fulfilOrder(ctx, shipped, {
      trackingCompany: "India Post",
      trackingNumber: "EM123456789IN",
      trackingUrl: "https://www.indiapost.gov.in/",
    });
  }
  const refunded = byNumber(1003);
  if (refunded) await refundOrder(ctx, refunded, { amount: "100", reason: "Box arrived damaged" });
  return true;
}
