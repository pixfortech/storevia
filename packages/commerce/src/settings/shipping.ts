import "server-only";
import type { TenantTx } from "@storevia/database";
import { recordAudit, type TenantContext } from "@storevia/tenancy";
import { notFound, validationFailed } from "@storevia/types";
import { countryByCode, hasRegions, regionByCode } from "@storevia/validation/geo";
import {
  inStore,
  internalId,
  optionalMoneyField,
  parseMoneyField,
  pgCode,
  publicId,
  storeSettings,
} from "../internal";
import type { MoneyJson } from "../money";

// Shipping settings (ADR-0031 §7), `settings.manage`: zones by country
// (optionally a single country's regions, all from the geo reference data)
// with FLAT or PRICE_BASED rates in the store currency. A price-based rate
// with amount 0 is "free over X". Each country is in at most one zone per
// store. Checkout re-validates every rate against the address and subtotal.

export interface ShippingRateView {
  readonly id: string;
  readonly name: string;
  readonly type: "FLAT" | "PRICE_BASED";
  readonly amount: MoneyJson;
  readonly minSubtotal: MoneyJson | null;
  readonly maxSubtotal: MoneyJson | null;
  readonly active: boolean;
}

export interface ShippingZoneView {
  readonly id: string;
  readonly name: string;
  readonly countries: readonly {
    readonly countryCode: string;
    readonly regionCodes: readonly string[];
  }[];
  readonly rates: readonly ShippingRateView[];
}

const m = (amount: bigint, currency: string): MoneyJson => ({
  amount: amount.toString(),
  currency: currency.trim(),
});

export async function getShippingSettings(
  ctx: TenantContext,
): Promise<readonly ShippingZoneView[]> {
  return inStore(ctx, "settings.manage", async (tx) => {
    const zones = await tx.shippingZone.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        countries: { orderBy: { countryCode: "asc" } },
        rates: { orderBy: [{ amount: "asc" }, { name: "asc" }] },
      },
    });
    return zones.map((z) => ({
      id: publicId("shippingZone", z.id),
      name: z.name,
      countries: z.countries.map((c) => ({
        countryCode: c.countryCode.trim(),
        regionCodes: c.regionCodes,
      })),
      rates: z.rates
        .filter((r) => r.type === "FLAT" || r.type === "PRICE_BASED")
        .map((r) => ({
          id: publicId("shippingRate", r.id),
          name: r.name,
          type: r.type as "FLAT" | "PRICE_BASED",
          amount: m(r.amount, r.currency),
          minSubtotal: r.minSubtotalAmount === null ? null : m(r.minSubtotalAmount, r.currency),
          maxSubtotal: r.maxSubtotalAmount === null ? null : m(r.maxSubtotalAmount, r.currency),
          active: r.active,
        })),
    }));
  });
}

/**
 * Codes from a list (repeated form fields, as the dashboard's checkbox lists
 * send them) or a comma- or space-separated string ("IN, NP"), upper-cased
 * and de-duplicated.
 */
const list = (value: unknown): string[] => {
  const items =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : [];
  return [
    ...new Set(
      items
        .flatMap((v) => v.split(/[\s,]+/))
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
};

export interface ShippingZoneInput {
  readonly name?: unknown;
  /** Country codes: a list, or "IN, NP". */
  readonly countries?: unknown;
  /** Region codes of a single-country zone: a list, or "KA, MH". Empty covers the whole country. */
  readonly regions?: unknown;
}

/**
 * Countries and regions must be in the geo reference data, so zones use the
 * same canonical ISO codes as checkout addresses and tax rates (a superseded
 * region code is stored as the current one). Regions narrow a zone of one
 * country that has a region list.
 */
function zoneInput(input: ShippingZoneInput) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const countries = list(input.countries);
  const typedRegions = list(input.regions);
  const errors: Record<string, string> = {};
  if (!name || name.length > 100) errors["name"] = "Enter a zone name of up to 100 characters.";
  const unknown = countries.filter((c) => !countryByCode(c));
  if (countries.length === 0) {
    errors["countries"] = "Choose at least one country.";
  } else if (unknown.length > 0 || countries.length > 250) {
    errors["countries"] = "Choose countries from the list.";
  }
  let regions: string[] = [];
  if (typedRegions.length > 0) {
    const country = countries.length === 1 ? countryByCode(countries[0]) : undefined;
    if (countries.length !== 1) {
      errors["regions"] = "Regions can be set for a zone with a single country.";
    } else if (country && !hasRegions(country)) {
      errors["regions"] =
        `${country.name} has no regions to choose from. The zone covers the whole country.`;
    } else if (country) {
      const found = typedRegions.map((code) => regionByCode(country, code));
      if (found.some((r) => !r)) {
        errors["regions"] = `Choose regions of ${country.name} from the list.`;
      } else {
        // Canonical codes, in the reference list's order.
        const chosen = new Set(found.map((r) => r?.code));
        regions = (country.regions ?? []).filter((r) => chosen.has(r.code)).map((r) => r.code);
      }
    }
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors);
  return { name, countries, regions };
}

const nameOf = (code: string) => countryByCode(code)?.name ?? code;

/**
 * Refuses a country that another of the store's zones already has: one zone
 * per country keeps checkout's matching unambiguous (the unique index on
 * (storeId, countryCode) enforces it; this names the country and zone).
 */
async function assertCountriesFree(
  tx: TenantTx,
  countries: readonly string[],
  zoneId: string | null,
): Promise<void> {
  const taken = await tx.shippingZoneCountry.findFirst({
    where: {
      countryCode: { in: [...countries] },
      ...(zoneId ? { zoneId: { not: zoneId } } : {}),
    },
    orderBy: { countryCode: "asc" },
    select: { countryCode: true, zone: { select: { name: true } } },
  });
  if (taken) {
    throw validationFailed({
      countries: `${nameOf(taken.countryCode.trim())} is already in the zone “${taken.zone.name}”. A country can be in one zone only.`,
    });
  }
}

function countryTaken(error: unknown): never {
  if (pgCode(error) === "23505") {
    throw validationFailed({ countries: "One of these countries is already in another zone." });
  }
  throw error;
}

export async function createShippingZone(
  ctx: TenantContext,
  input: ShippingZoneInput,
): Promise<{ readonly zoneId: string }> {
  const zone = zoneInput(input);
  return inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const base = { organisationId: store.organisationId, storeId: store.storeId };
      await assertCountriesFree(tx, zone.countries, null);
      try {
        const created = await tx.shippingZone.create({
          data: { ...base, name: zone.name },
          select: { id: true },
        });
        await tx.shippingZoneCountry.createMany({
          data: zone.countries.map((countryCode) => ({
            ...base,
            zoneId: created.id,
            countryCode,
            regionCodes: zone.regions,
          })),
        });
        await recordAudit(
          tx,
          store,
          "shipping.zone.created",
          { type: "ShippingZone", id: created.id },
          {
            name: zone.name,
          },
        );
        return { zoneId: publicId("shippingZone", created.id) };
      } catch (error) {
        return countryTaken(error);
      }
    },
    { write: true },
  );
}

export async function updateShippingZone(
  ctx: TenantContext,
  zonePublicId: unknown,
  input: ShippingZoneInput,
): Promise<void> {
  const id = internalId("shippingZone", zonePublicId);
  const zone = zoneInput(input);
  await inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const existing = await tx.shippingZone.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw notFound();
      const base = { organisationId: store.organisationId, storeId: store.storeId };
      await assertCountriesFree(tx, zone.countries, id);
      try {
        await tx.shippingZone.update({ where: { id }, data: { name: zone.name } });
        await tx.shippingZoneCountry.deleteMany({ where: { zoneId: id } });
        await tx.shippingZoneCountry.createMany({
          data: zone.countries.map((countryCode) => ({
            ...base,
            zoneId: id,
            countryCode,
            regionCodes: zone.regions,
          })),
        });
      } catch (error) {
        countryTaken(error);
      }
      await recordAudit(
        tx,
        store,
        "shipping.zone.updated",
        { type: "ShippingZone", id },
        {
          name: zone.name,
        },
      );
    },
    { write: true },
  );
}

export async function deleteShippingZone(ctx: TenantContext, zonePublicId: unknown): Promise<void> {
  const id = internalId("shippingZone", zonePublicId);
  await inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const deleted = await tx.shippingZone.deleteMany({ where: { id } });
      if (deleted.count === 0) throw notFound();
      await recordAudit(tx, store, "shipping.zone.deleted", { type: "ShippingZone", id });
    },
    { write: true },
  );
}

export interface ShippingRateInput {
  readonly name?: unknown;
  readonly type?: unknown;
  readonly amount?: unknown;
  readonly minSubtotal?: unknown;
  readonly maxSubtotal?: unknown;
  readonly active?: unknown;
}

function rateInput(input: ShippingRateInput, currency: string) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100)
    throw validationFailed({ name: "Enter a rate name of up to 100 characters." });
  const type = input.type === "PRICE_BASED" ? "PRICE_BASED" : "FLAT";
  const amount = parseMoneyField(
    "amount",
    typeof input.amount === "string" ? input.amount : "",
    currency,
  );
  if (amount < 0n) throw validationFailed({ amount: "Enter zero or more." });
  const opt = (field: string, value: unknown) =>
    type === "PRICE_BASED" && typeof value === "string" && value.trim()
      ? (optionalMoneyField(field, value, currency) ?? null)
      : null;
  const min = opt("minSubtotal", input.minSubtotal);
  const max = opt("maxSubtotal", input.maxSubtotal);
  if ((min !== null && min < 0n) || (max !== null && max < 0n)) {
    throw validationFailed({ minSubtotal: "Enter zero or more." });
  }
  if (min !== null && max !== null && min > max) {
    throw validationFailed({ maxSubtotal: "The maximum must be at least the minimum." });
  }
  const active = input.active === undefined ? true : input.active === true || input.active === "on";
  return { name, type, amount, min, max, active } as const;
}

export async function createShippingRate(
  ctx: TenantContext,
  zonePublicId: unknown,
  input: ShippingRateInput,
): Promise<{ readonly rateId: string }> {
  const zoneId = internalId("shippingZone", zonePublicId);
  return inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const zone = await tx.shippingZone.findUnique({
        where: { id: zoneId },
        select: { id: true },
      });
      if (!zone) throw notFound();
      const { currency } = await storeSettings(tx, store.storeId);
      const rate = rateInput(input, currency);
      const created = await tx.shippingRate.create({
        data: {
          organisationId: store.organisationId,
          storeId: store.storeId,
          zoneId,
          name: rate.name,
          type: rate.type,
          currency,
          amount: rate.amount,
          minSubtotalAmount: rate.min,
          maxSubtotalAmount: rate.max,
          active: rate.active,
        },
        select: { id: true },
      });
      await recordAudit(
        tx,
        store,
        "shipping.rate.created",
        { type: "ShippingRate", id: created.id },
        {
          name: rate.name,
        },
      );
      return { rateId: publicId("shippingRate", created.id) };
    },
    { write: true },
  );
}

export async function updateShippingRate(
  ctx: TenantContext,
  ratePublicId: unknown,
  input: ShippingRateInput,
): Promise<void> {
  const id = internalId("shippingRate", ratePublicId);
  await inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const { currency } = await storeSettings(tx, store.storeId);
      const rate = rateInput(input, currency);
      const updated = await tx.shippingRate.updateMany({
        where: { id },
        data: {
          name: rate.name,
          type: rate.type,
          amount: rate.amount,
          minSubtotalAmount: rate.min,
          maxSubtotalAmount: rate.max,
          active: rate.active,
        },
      });
      if (updated.count === 0) throw notFound();
      await recordAudit(
        tx,
        store,
        "shipping.rate.updated",
        { type: "ShippingRate", id },
        {
          name: rate.name,
        },
      );
    },
    { write: true },
  );
}

export async function deleteShippingRate(ctx: TenantContext, ratePublicId: unknown): Promise<void> {
  const id = internalId("shippingRate", ratePublicId);
  await inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const deleted = await tx.shippingRate.deleteMany({ where: { id } });
      if (deleted.count === 0) throw notFound();
      await recordAudit(tx, store, "shipping.rate.deleted", { type: "ShippingRate", id });
    },
    { write: true },
  );
}
