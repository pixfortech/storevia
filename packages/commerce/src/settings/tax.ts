import "server-only";
import { recordAudit, type TenantContext } from "@storevia/tenancy";
import { notFound, validationFailed } from "@storevia/types";
import { inStore, internalId, publicId } from "../internal";

// Tax settings (ADR-0031 §7), `settings.manage`: manual rates by country
// (optionally a region), prices tax-inclusive or exclusive, and whether
// shipping is taxed. No automated or compound tax in M6.

export interface TaxRateView {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly regionCode: string | null;
  /** Percent as a decimal string, e.g. "18" or "7.25". */
  readonly rate: string;
}

export interface TaxSettings {
  readonly pricesIncludeTax: boolean;
  readonly chargeTaxOnShipping: boolean;
  readonly taxRegistrationId: string | null;
  readonly rates: readonly TaxRateView[];
}

/** ppm → "18", "7.25". */
export function ppmToPercent(ppm: number): string {
  const whole = Math.trunc(ppm / 10_000);
  const fraction = (ppm % 10_000).toString().padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${String(whole)}.${fraction}` : String(whole);
}

/** "18", "7.25" → ppm, exactly (up to four decimals). */
export function percentToPpm(value: unknown): number {
  const text = typeof value === "string" ? value.trim().replace(/%$/, "").trim() : "";
  const match = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(text);
  if (!match?.[1]) throw validationFailed({ rate: "Enter a percentage, like 18 or 7.25." });
  const ppm = Number(match[1]) * 10_000 + Number((match[2] ?? "").padEnd(4, "0"));
  if (ppm > 1_000_000) throw validationFailed({ rate: "A rate can be at most 100%." });
  return ppm;
}

export async function getTaxSettings(ctx: TenantContext): Promise<TaxSettings> {
  return inStore(ctx, "settings.manage", async (tx) => {
    const config = await tx.taxConfiguration.findFirst();
    const rates = await tx.taxRate.findMany({
      orderBy: [{ countryCode: "asc" }, { regionCode: "asc" }, { name: "asc" }],
    });
    return {
      pricesIncludeTax: config?.pricesIncludeTax ?? false,
      chargeTaxOnShipping: config?.chargeTaxOnShipping ?? false,
      taxRegistrationId: config?.taxRegistrationId ?? null,
      rates: rates.map((r) => ({
        id: publicId("taxRate", r.id),
        name: r.name,
        countryCode: r.countryCode.trim(),
        regionCode: r.regionCode,
        rate: ppmToPercent(r.ratePpm),
      })),
    };
  });
}

const on = (value: unknown) => value === true || value === "on" || value === "true";

export async function updateTaxSettings(
  ctx: TenantContext,
  input: {
    readonly pricesIncludeTax?: unknown;
    readonly chargeTaxOnShipping?: unknown;
    readonly taxRegistrationId?: unknown;
  },
): Promise<void> {
  const registration =
    typeof input.taxRegistrationId === "string" ? input.taxRegistrationId.trim() || null : null;
  if (registration && registration.length > 64) {
    throw validationFailed({ taxRegistrationId: "Use at most 64 characters." });
  }
  await inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const data = {
        pricesIncludeTax: on(input.pricesIncludeTax),
        chargeTaxOnShipping: on(input.chargeTaxOnShipping),
        taxRegistrationId: registration,
      };
      await tx.taxConfiguration.upsert({
        where: { storeId: store.storeId },
        create: { storeId: store.storeId, organisationId: store.organisationId, ...data },
        update: data,
      });
      await recordAudit(
        tx,
        store,
        "tax.settings.updated",
        { type: "Store", id: store.storeId },
        {
          fields: "pricesIncludeTax,chargeTaxOnShipping,taxRegistrationId",
        },
      );
    },
    { write: true },
  );
}

function rateInput(input: {
  readonly name?: unknown;
  readonly countryCode?: unknown;
  readonly regionCode?: unknown;
  readonly rate?: unknown;
}) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const countryCode =
    typeof input.countryCode === "string" ? input.countryCode.trim().toUpperCase() : "";
  const regionCode =
    typeof input.regionCode === "string" ? input.regionCode.trim().toUpperCase() || null : null;
  const errors: Record<string, string> = {};
  if (!name || name.length > 100)
    errors["name"] = "Enter a name of up to 100 characters, like GST.";
  if (!/^[A-Z]{2}$/.test(countryCode)) errors["countryCode"] = "Enter a two-letter country code.";
  if (regionCode && !/^[A-Z0-9-]{1,10}$/.test(regionCode)) {
    errors["regionCode"] = "Enter a region code, like KA.";
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors);
  return { name, countryCode, regionCode, ratePpm: percentToPpm(input.rate) };
}

export async function createTaxRate(
  ctx: TenantContext,
  input: Parameters<typeof rateInput>[0],
): Promise<{ readonly rateId: string }> {
  const rate = rateInput(input);
  return inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const created = await tx.taxRate.create({
        data: { organisationId: store.organisationId, storeId: store.storeId, ...rate },
        select: { id: true },
      });
      await recordAudit(
        tx,
        store,
        "tax.rate.created",
        { type: "TaxRate", id: created.id },
        {
          name: rate.name,
        },
      );
      return { rateId: publicId("taxRate", created.id) };
    },
    { write: true },
  );
}

export async function updateTaxRate(
  ctx: TenantContext,
  ratePublicId: unknown,
  input: Parameters<typeof rateInput>[0],
): Promise<void> {
  const id = internalId("taxRate", ratePublicId);
  const rate = rateInput(input);
  await inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const updated = await tx.taxRate.updateMany({ where: { id }, data: rate });
      if (updated.count === 0) throw notFound();
      await recordAudit(
        tx,
        store,
        "tax.rate.updated",
        { type: "TaxRate", id },
        { name: rate.name },
      );
    },
    { write: true },
  );
}

export async function deleteTaxRate(ctx: TenantContext, ratePublicId: unknown): Promise<void> {
  const id = internalId("taxRate", ratePublicId);
  await inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const deleted = await tx.taxRate.deleteMany({ where: { id } });
      if (deleted.count === 0) throw notFound();
      await recordAudit(tx, store, "tax.rate.deleted", { type: "TaxRate", id });
    },
    { write: true },
  );
}
