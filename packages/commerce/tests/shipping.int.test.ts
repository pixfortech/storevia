// Shipping zones and rates (ADR-0031 §7) end to end: configured through the
// settings services exactly as the dashboard does, matched by checkout
// against the saved address and the order subtotal. Nothing about a rate is
// hard-coded: amounts, thresholds and regions all come from the store's own
// rows. Also covers the zone input rules (geo reference data, one zone per
// country) and tenancy: another store's zones and rates never appear.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { parseTypeId, toTypeId, uuidv7 } from "@storevia/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createProduct,
  createShippingRate,
  createShippingZone,
  createTaxRate,
  deleteShippingRate,
  getProduct,
  getShippingSettings,
  getTaxSettings,
  updateShippingRate,
  updateShippingZone,
} from "../src";
import {
  getCheckout,
  selectShippingRate,
  startCheckout,
  updateAddress,
  updateContact,
  type CheckoutRequest,
  type CheckoutStore,
} from "../src/checkout";
import { addToCart } from "../src/storefront";
import { expectCode, makeTenant, storeOf, type Tenant } from "./fixtures";

let a: Tenant;
let b: Tenant;
let wb: Tenant;
const variant: Record<string, string> = {};
let ipCounter = 0;

const nextIp = () => {
  ipCounter += 1;
  return `203.0.113.${String(ipCounter % 250)}`;
};

const checkoutStore = (tenant: Tenant): CheckoutStore => {
  const s = storeOf(tenant);
  return { organisationId: s.organisationId, storeId: s.storeId, currency: "INR", name: "Shop" };
};

async function makeProduct(tenant: Tenant, key: string, price: string) {
  const ctx = storeOf(tenant);
  const { productId } = await createProduct(ctx, {
    title: key,
    price,
    initialStock: 100,
    status: "ACTIVE",
  });
  variant[key] = (await getProduct(ctx, productId)).variants[0]?.id ?? "";
}

/** India: Standard ₹60 on every order, Free from ₹1,999 (the merchant's own figures). */
async function indiaRates(tenant: Tenant, regions: readonly string[] = []) {
  const ctx = storeOf(tenant);
  const { zoneId } = await createShippingZone(ctx, {
    name: "India",
    countries: ["IN"],
    regions: [...regions],
  });
  const standard = await createShippingRate(ctx, zoneId, {
    name: "Standard",
    type: "FLAT",
    amount: "60",
  });
  const free = await createShippingRate(ctx, zoneId, {
    name: "Free shipping",
    type: "PRICE_BASED",
    amount: "0",
    minSubtotal: "1999",
  });
  return { zoneId, standard: standard.rateId, free: free.rateId };
}

async function shopper(tenant: Tenant, key: string): Promise<CheckoutRequest> {
  const store = checkoutStore(tenant);
  const clientIp = nextIp();
  const { newToken } = await addToCart(
    { store, token: null, clientIp },
    { variantId: variant[key], quantity: 1 },
  );
  const { token } = await startCheckout({ store, token: null, clientIp, cartToken: newToken });
  const req = { store, token, clientIp };
  await updateContact(req, { email: "shopper@example.test" });
  return req;
}

const address = (region: string, extra: Record<string, string> = {}) => ({
  firstName: "Govind",
  lastName: "Lohia",
  line1: "7 Park Street",
  city: "Kolkata",
  countryCode: "IN",
  region,
  postalCode: "700016",
  ...extra,
});

const storedRate = async (req: CheckoutRequest) => {
  const view = await getCheckout(req);
  const row = await migratorDb().checkout.findFirstOrThrow({
    where: { storeId: req.store.storeId, pricingHash: view?.pricingHash ?? "" },
    select: { shippingRateId: true },
  });
  return row.shippingRateId;
};

let rates: Awaited<ReturnType<typeof indiaRates>>;
let wbRates: Awaited<ReturnType<typeof indiaRates>>;
let foreignRate: string;

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("ship-a");
  b = await makeTenant("ship-b");
  wb = await makeTenant("ship-wb");
  await makeProduct(a, "small", "799");
  await makeProduct(a, "large", "2500");
  await makeProduct(wb, "wb-small", "799");
  rates = await indiaRates(a);
  wbRates = await indiaRates(wb, ["WB"]);
  // Store B ships to Nepal only, at its own rate.
  const { zoneId } = await createShippingZone(storeOf(b), { name: "Nepal", countries: "NP" });
  foreignRate = (
    await createShippingRate(storeOf(b), zoneId, {
      name: "Nepal post",
      type: "FLAT",
      amount: "300",
    })
  ).rateId;
});

beforeEach(async () => {
  await migratorDb().rateLimit.deleteMany({});
});

afterAll(disconnectTestClients);

describe("matching rates to the address and subtotal", () => {
  it("offers Standard below the free-shipping threshold, and both from it", async () => {
    const small = await shopper(a, "small");
    const view = await updateAddress(small, address("KA", { city: "Bengaluru" }));
    expect(view.subtotal.amount).toBe("79900");
    expect(view.shippingOptions.map((o) => [o.name, o.amount.amount])).toEqual([
      ["Standard", "6000"],
    ]);

    const large = await shopper(a, "large");
    const both = await updateAddress(large, address("KA", { city: "Bengaluru" }));
    expect(both.subtotal.amount).toBe("250000");
    expect(both.shippingOptions.map((o) => [o.name, o.amount.amount])).toEqual([
      ["Free shipping", "0"],
      ["Standard", "6000"],
    ]);
  });

  it("a zone narrowed to West Bengal covers WB addresses only", async () => {
    const [zone] = await getShippingSettings(storeOf(wb));
    expect(zone?.countries).toEqual([{ countryCode: "IN", regionCodes: ["WB"] }]);

    const req = await shopper(wb, "wb-small");
    // The state's name is normalised to its ISO 3166-2 code.
    const inBengal = await updateAddress(req, address("West Bengal"));
    expect(inBengal.shippingAddress).toMatchObject({ region: "West Bengal", regionCode: "WB" });
    expect(inBengal.shippingOptions.map((o) => o.name)).toEqual(["Standard"]);
    const chosen = await selectShippingRate(req, { rateId: inBengal.shippingOptions[0]?.id });
    expect(chosen.shipping?.name).toBe("Standard");
    expect(await storedRate(req)).toBe(parseTypeId("shippingRate", wbRates.standard));

    // Karnataka isn't covered: no options, the choice is cleared, and the
    // shopper is told why.
    const inKarnataka = await updateAddress(req, address("KA", { city: "Bengaluru" }));
    expect(inKarnataka.shippingOptions).toEqual([]);
    expect(inKarnataka.shipping).toBeNull();
    expect(inKarnataka.problems).toContain("SHIPPING_UNAVAILABLE");
    expect(await storedRate(req)).toBeNull();
    await expectCode(selectShippingRate(req, { rateId: wbRates.standard }), "VALIDATION_FAILED");
    // Back in West Bengal the old choice isn't silently restored.
    const back = await updateAddress(req, address("WB"));
    expect(back.shipping).toBeNull();
    expect(back.problems).toContain("SHIPPING");
  });

  it("a rate made inactive or deleted disappears, even once chosen", async () => {
    const ctx = storeOf(a);
    const req = await shopper(a, "large");
    const view = await updateAddress(req, address("MH", { city: "Mumbai", postalCode: "400002" }));
    const standard = view.shippingOptions.find((o) => o.name === "Standard");
    await selectShippingRate(req, { rateId: standard?.id });

    await updateShippingRate(ctx, rates.standard, {
      name: "Standard",
      type: "FLAT",
      amount: "60",
      active: false,
    });
    const inactive = await getCheckout(req);
    expect(inactive?.shippingOptions.map((o) => o.name)).toEqual(["Free shipping"]);
    expect(inactive?.shipping).toBeNull();
    expect(inactive?.problems).toContain("SHIPPING");
    await expectCode(selectShippingRate(req, { rateId: rates.standard }), "VALIDATION_FAILED");

    await deleteShippingRate(ctx, rates.free);
    const none = await getCheckout(req);
    expect(none?.shippingOptions).toEqual([]);
    expect(none?.problems).toContain("SHIPPING_UNAVAILABLE");

    // Restored for the other tests.
    await updateShippingRate(ctx, rates.standard, {
      name: "Standard",
      type: "FLAT",
      amount: "60",
      active: true,
    });
  });

  it("refuses forged rate ids: another store's rate, an unknown id, garbage", async () => {
    const req = await shopper(a, "small");
    await updateAddress(req, address("KA", { city: "Bengaluru" }));
    await expectCode(selectShippingRate(req, { rateId: foreignRate }), "VALIDATION_FAILED");
    await expectCode(
      selectShippingRate(req, { rateId: toTypeId("shippingRate", uuidv7()) }),
      "VALIDATION_FAILED",
    );
    await expectCode(selectShippingRate(req, { rateId: "not-a-rate" }), "VALIDATION_FAILED");
    expect(await storedRate(req)).toBeNull();
  });

  it("never shows another store's zones or rates", async () => {
    const req = await shopper(a, "small");
    const view = await updateAddress(req, {
      ...address("", { city: "Kathmandu", postalCode: "44600" }),
      countryCode: "NP",
    });
    expect(view.shippingOptions).toEqual([]);
    expect(view.problems).toContain("SHIPPING_UNAVAILABLE");
    expect(view.shippingCountries).toEqual(["IN"]);
    const zones = await getShippingSettings(storeOf(a));
    expect(zones.map((z) => z.name)).toEqual(["India"]);
    expect(zones.flatMap((z) => z.rates.map((r) => r.name))).not.toContain("Nepal post");
  });
});

describe("zone input", () => {
  it("takes countries and regions as lists or comma-separated codes, stored canonically", async () => {
    const ctx = storeOf(b);
    const { zoneId } = await createShippingZone(ctx, {
      name: "North America",
      countries: "us, CA",
    });
    await updateShippingZone(ctx, zoneId, {
      name: "Odisha only",
      countries: ["IN"],
      regions: ["or"], // Odisha's superseded ISO code
    });
    const zone = (await getShippingSettings(ctx)).find((z) => z.id === zoneId);
    expect(zone?.countries).toEqual([{ countryCode: "IN", regionCodes: ["OD"] }]);
    await updateShippingZone(ctx, zoneId, {
      name: "Two states",
      countries: "IN",
      regions: "WB, KA",
    });
    const two = (await getShippingSettings(ctx)).find((z) => z.id === zoneId);
    expect(two?.countries).toEqual([{ countryCode: "IN", regionCodes: ["KA", "WB"] }]);
  });

  it("refuses what isn't in the reference data, and regions outside a single listed country", async () => {
    const ctx = storeOf(b);
    const fields = async (input: Parameters<typeof createShippingZone>[1]) => {
      try {
        await createShippingZone(ctx, input);
      } catch (error) {
        return (error as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
      }
      throw new Error("expected a validation error");
    };
    expect(await fields({ name: "None", countries: [] })).toEqual({
      countries: "Choose at least one country.",
    });
    expect(await fields({ name: "Bad", countries: ["XX"] })).toEqual({
      countries: "Choose countries from the list.",
    });
    expect(await fields({ name: "Two", countries: ["GB", "IE"], regions: ["KA"] })).toEqual({
      regions: "Regions can be set for a zone with a single country.",
    });
    expect(await fields({ name: "UK", countries: ["GB"], regions: ["ENG"] })).toEqual({
      regions: "United Kingdom has no regions to choose from. The zone covers the whole country.",
    });
    expect(await fields({ name: "Wrong", countries: ["AU"], regions: ["KA"] })).toEqual({
      regions: "Choose regions of Australia from the list.",
    });
  });

  it("refuses a country that another zone of the store has, naming both", async () => {
    await expect(
      createShippingZone(storeOf(a), { name: "Domestic", countries: ["NP", "IN"] }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: {
        countries: "India is already in the zone “India”. A country can be in one zone only.",
      },
    });
    // Another store's zones don't count: B ships to Nepal, and A may too.
    const { zoneId } = await createShippingZone(storeOf(a), { name: "Nepal", countries: ["NP"] });
    // Saving a zone with its own countries is fine.
    await updateShippingZone(storeOf(a), zoneId, { name: "Nepal", countries: ["NP"] });
    expect((await getShippingSettings(storeOf(a))).map((z) => z.name)).toEqual(["India", "Nepal"]);
  });
});

describe("tax rates use the same region codes", () => {
  it("stores a region given by name or superseded code as its canonical code", async () => {
    const ctx = storeOf(wb);
    await createTaxRate(ctx, {
      name: "SGST WB",
      countryCode: "IN",
      regionCode: "West Bengal",
      rate: "9",
    });
    await createTaxRate(ctx, { name: "SGST OD", countryCode: "IN", regionCode: "or", rate: "9" });
    const { rates: saved } = await getTaxSettings(ctx);
    expect(saved.map((r) => [r.name, r.regionCode])).toEqual([
      ["SGST OD", "OD"],
      ["SGST WB", "WB"],
    ]);
    await expectCode(
      createTaxRate(ctx, { name: "X", countryCode: "IN", regionCode: "CA", rate: "1" }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      createTaxRate(ctx, { name: "X", countryCode: "GB", regionCode: "ENG", rate: "1" }),
      "VALIDATION_FAILED",
    );
  });
});
