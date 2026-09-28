import { validationFailed } from "@storevia/types";
import { countryByCode, findRegion, hasRegions } from "@storevia/validation/geo";
import type { CheckoutAddress } from "./pricing";

// Checkout form input (ADR-0031 §1). Everything a shopper types is bounded,
// trimmed and shaped here, before it reaches pricing or the database; empty
// optional fields become null. Messages are safe to show next to the field.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const CODE_RE = /^[A-Z0-9_-]{1,32}$/;

const text = (value: unknown): string =>
  typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";

/** A contact email, or a field error. Kept as typed (case is matched case-insensitively later). */
export function parseEmail(value: unknown): string {
  const email = text(value);
  if (!email) throw validationFailed({ email: "Enter your email address." });
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw validationFailed({ email: "Enter a valid email address, like name@example.com." });
  }
  return email;
}

type Field = keyof CheckoutAddress;

/** Fields checked by length alone; region and postal code have their own rules below. */
type PlainField = Exclude<Field, "region" | "regionCode" | "postalCode">;

const LIMITS: Readonly<Record<PlainField, { max: number; required: boolean; label: string }>> = {
  firstName: { max: 100, required: true, label: "first name" },
  lastName: { max: 100, required: true, label: "last name" },
  company: { max: 100, required: false, label: "company" },
  line1: { max: 200, required: true, label: "address" },
  line2: { max: 200, required: false, label: "apartment, suite, etc." },
  city: { max: 100, required: true, label: "city" },
  countryCode: { max: 2, required: true, label: "country" },
  phone: { max: 32, required: false, label: "phone" },
};

const REGION_MAX = 100;
const POSTAL_MAX = 20;

/**
 * An address from form fields (`prefix` + field name, e.g. "billing_line1").
 *
 * Region: in a country with a region list (the geo reference data) the
 * region is required and must be one of that country's. It is read from
 * `regionCode` or `region`, as a code or a name, and stored as both: the
 * canonical ISO 3166-2 code (what shipping zones and tax rates match) and
 * the English name. Elsewhere `region` is optional free text and
 * `regionCode` is null. `regionCountry` names the country whose regions the
 * form offered: the checkout has no script, so when the shopper changes the
 * country, a region picked from the old country's list isn't trusted.
 *
 * Postal code: checked against the country's rule when it has one (India: a
 * 6-digit PIN, spaces removed), otherwise optional free text.
 */
export function parseAddress(
  input: Readonly<Record<string, unknown>>,
  prefix = "",
): CheckoutAddress {
  const errors: Record<string, string> = {};
  const values: Partial<Record<PlainField, string | null>> = {};
  for (const [field, rule] of Object.entries(LIMITS) as [
    PlainField,
    (typeof LIMITS)[PlainField],
  ][]) {
    let value = text(input[`${prefix}${field}`]);
    if (field === "countryCode") value = value.toUpperCase();
    if (!value) {
      if (rule.required) errors[`${prefix}${field}`] = `Enter your ${rule.label}.`;
      values[field] = null;
      continue;
    }
    if (value.length > rule.max) {
      errors[`${prefix}${field}`] =
        `Your ${rule.label} can be at most ${String(rule.max)} characters.`;
      continue;
    }
    values[field] = value;
  }
  const countryCode = values.countryCode ?? null;
  if (countryCode && !COUNTRY_RE.test(countryCode)) {
    errors[`${prefix}countryCode`] = "Choose a country.";
  }
  const country = countryByCode(countryCode);

  // Region.
  let region: string | null = null;
  let regionCode: string | null = null;
  const typedCode = text(input[`${prefix}regionCode`]);
  const typedName = text(input[`${prefix}region`]);
  const offeredFor = text(input[`${prefix}regionCountry`]).toUpperCase();
  const stale = offeredFor !== "" && offeredFor !== countryCode && hasRegions(offeredFor);
  if (country && hasRegions(country)) {
    const found = stale
      ? undefined
      : (findRegion(country, typedCode) ?? findRegion(country, typedName));
    if (found) {
      region = found.name;
      regionCode = found.code;
    } else {
      const label = (country.regionLabel ?? "state or region").toLowerCase();
      errors[`${prefix}region`] = `Choose your ${label}.`;
    }
  } else if (typedName && !stale) {
    if (typedName.length > REGION_MAX) {
      errors[`${prefix}region`] =
        `Your state or region can be at most ${String(REGION_MAX)} characters.`;
    } else {
      region = typedName;
    }
  }

  // Postal code.
  let postalCode: string | null = null;
  const typedPostal = text(input[`${prefix}postalCode`]);
  const postalRule = country?.postalCode ?? null;
  if (postalRule) {
    const compact = typedPostal.replace(/\s+/g, "");
    if (!compact) {
      if (postalRule.required) errors[`${prefix}postalCode`] = `Enter your ${postalRule.label}.`;
    } else if (!postalRule.pattern.test(compact)) {
      errors[`${prefix}postalCode`] = postalRule.message;
    } else {
      postalCode = compact;
    }
  } else if (typedPostal.length > POSTAL_MAX) {
    errors[`${prefix}postalCode`] =
      `Your postal code can be at most ${String(POSTAL_MAX)} characters.`;
  } else {
    postalCode = typedPostal || null;
  }

  const phone = values.phone;
  if (phone && !/^\+?[0-9 ()-]{4,32}$/.test(phone)) {
    errors[`${prefix}phone`] = "Enter a valid phone number.";
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors);
  return {
    firstName: values.firstName ?? "",
    lastName: values.lastName ?? "",
    company: values.company ?? null,
    line1: values.line1 ?? "",
    line2: values.line2 ?? null,
    city: values.city ?? "",
    region,
    regionCode,
    postalCode,
    countryCode: countryCode ?? "",
    phone: values.phone ?? null,
  };
}

const storedText = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= 300 ? value : null;

/**
 * An address read back from the checkout row. It was written by parseAddress,
 * possibly under older rules, so only its shape is checked: an address the
 * shopper saved (and a payment in flight relies on) is never dropped because
 * the rules for new input became stricter.
 */
export function storedAddress(value: unknown): CheckoutAddress | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const read = (name: Field) => storedText(v[name]);
  const firstName = read("firstName");
  const lastName = read("lastName");
  const line1 = read("line1");
  const city = read("city");
  const countryCode = read("countryCode");
  if (!firstName || !lastName || !line1 || !city || !countryCode) return null;
  if (!COUNTRY_RE.test(countryCode)) return null;
  return {
    firstName,
    lastName,
    company: read("company"),
    line1,
    line2: read("line2"),
    city,
    region: read("region"),
    regionCode: read("regionCode"),
    postalCode: read("postalCode"),
    countryCode,
    phone: read("phone"),
  };
}

/** A discount code as stored (upper-case), or a field error. */
export function parseDiscountCode(value: unknown): string {
  const code = text(value).toUpperCase();
  if (!code) throw validationFailed({ code: "Enter a discount code." });
  if (!CODE_RE.test(code)) throw validationFailed({ code: "That code isn't valid." });
  return code;
}
