import "server-only";
import { recordAudit, type TenantContext } from "@storevia/tenancy";
import { validationFailed } from "@storevia/types";
import { countryByCode, findRegion, hasRegions } from "@storevia/validation/geo";
import { inStore } from "../internal";

// The store's public seller identity (final pass, Phase 2A): the legal or
// business name, phone and business address a shopper sees in the footer
// and on the contact page. Kept apart from the organisation and account
// (who pays Storevia and who signs in). GSTIN is stored and validated for
// Phase 2B; nothing is calculated from it yet. Every field is checked here
// and again by the database: bounded, printable, no control characters.

export interface SellerProfile {
  readonly legalName: string | null;
  readonly phone: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  /** A region code where the country has a list (e.g. "KA"), else free text. */
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly gstin: string | null;
}

export const EMPTY_SELLER_PROFILE: SellerProfile = {
  legalName: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  countryCode: null,
  gstin: null,
};

/** The fields a shopper needs to know who they are buying from. */
export const REQUIRED_SELLER_FIELDS = [
  "legalName",
  "phone",
  "addressLine1",
  "city",
  "postalCode",
  "countryCode",
] as const satisfies readonly (keyof SellerProfile)[];

const LABELS: Record<(typeof REQUIRED_SELLER_FIELDS)[number], string> = {
  legalName: "legal or business name",
  phone: "phone number",
  addressLine1: "address",
  city: "city",
  postalCode: "postal code",
  countryCode: "country",
};

/** What is missing for a complete public seller identity, in words (empty: complete). */
export function sellerProfileGaps(profile: SellerProfile): string[] {
  return REQUIRED_SELLER_FIELDS.filter((f) => !profile[f]).map((f) => LABELS[f]);
}

// Printable text only: C0/C1 control characters (CR and LF included) never
// reach a header, an email or a page.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,30}$/;
const POSTAL = /^[A-Za-z0-9][A-Za-z0-9 -]{1,18}[A-Za-z0-9]$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The GSTIN check character (mod-36 weighted sum, as issued by the GST network). */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i] ?? "");
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] ?? "";
}

/** Whether a GSTIN is well formed and its check character matches. */
export function isValidGstin(value: string): boolean {
  return GSTIN.test(value) && gstinCheckCharacter(value.slice(0, 14)) === value.slice(14);
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Validates and normalises seller-profile input (empty strings clear a field). */
export function parseSellerProfile(input: Record<string, unknown>): SellerProfile {
  const errors: Record<string, string> = {};
  const bounded = (field: string, max: number, label: string): string | null => {
    const raw = text(input[field]);
    if (!raw) return null;
    // Checked before spaces are tidied, so a line break is refused, not folded away.
    const value = raw.replace(/ {2,}/g, " ");
    if (CONTROL.test(raw)) {
      errors[field] = `Remove the line breaks and special characters from the ${label}.`;
    } else if (value.length > max) {
      errors[field] = `Use at most ${String(max)} characters.`;
    }
    return value;
  };
  const legalName = bounded("legalName", 200, "name");
  const addressLine1 = bounded("addressLine1", 200, "address");
  const addressLine2 = bounded("addressLine2", 200, "address");
  const city = bounded("city", 100, "city");

  const phone = text(input["phone"]).replace(/ {2,}/g, " ") || null;
  if (phone && !PHONE.test(phone)) {
    errors["phone"] =
      "Enter a phone number with digits, spaces, brackets or dashes, like +91 80 4000 1234.";
  }
  const postalCode = text(input["postalCode"]).toUpperCase() || null;
  if (postalCode && !POSTAL.test(postalCode)) errors["postalCode"] = "Enter a valid postal code.";

  const countryText = text(input["countryCode"]).toUpperCase();
  const country = countryText ? countryByCode(countryText) : undefined;
  if (countryText && !country) errors["countryCode"] = "Choose a country from the list.";
  const countryCode = country?.code ?? null;

  let region: string | null = text(input["region"]) || null;
  if (region && country && hasRegions(country)) {
    const found = findRegion(country, region);
    if (found) region = found.code;
    else errors["region"] = "Choose a state or region from the list.";
  } else if (region) {
    if (CONTROL.test(region)) errors["region"] = "Remove the special characters from the region.";
    else if (region.length > 100) errors["region"] = "Use at most 100 characters.";
  }

  const gstin = text(input["gstin"]).toUpperCase().replace(/\s+/g, "") || null;
  if (gstin && !isValidGstin(gstin)) {
    errors["gstin"] = "Enter a valid 15-character GSTIN, like 29ABCDE1234F1Z5.";
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors);
  return {
    legalName,
    phone,
    addressLine1,
    addressLine2,
    city,
    region,
    postalCode,
    countryCode,
    gstin,
  };
}

/** The store's seller profile (empty until saved). Needs `store.read`. */
export async function getSellerProfile(ctx: TenantContext): Promise<SellerProfile> {
  return inStore(ctx, "store.read", async (tx) => {
    const row = await tx.storeSellerProfile.findFirst();
    if (!row) return EMPTY_SELLER_PROFILE;
    return {
      legalName: row.legalName,
      phone: row.phone,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      region: row.region,
      postalCode: row.postalCode,
      countryCode: row.countryCode?.trim() ?? null,
      gstin: row.gstin,
    };
  });
}

/** Saves the whole seller profile. Needs `store.update`; audited (field names only). */
export async function updateSellerProfile(
  ctx: TenantContext,
  input: Record<string, unknown>,
): Promise<SellerProfile> {
  const profile = parseSellerProfile(input);
  return inStore(
    ctx,
    "store.update",
    async (tx, store) => {
      await tx.storeSellerProfile.upsert({
        where: { storeId: store.storeId },
        create: {
          storeId: store.storeId,
          organisationId: store.organisationId,
          ...profile,
          updatedById: store.userId,
        },
        update: { ...profile, updatedById: store.userId },
      });
      await recordAudit(
        tx,
        store,
        "store.seller_profile_updated",
        { type: "Store", id: store.storeId },
        {
          fields: Object.entries(profile)
            .filter(([, v]) => v !== null)
            .map(([k]) => k)
            .join(","),
        },
      );
      return profile;
    },
    { write: true },
  );
}
