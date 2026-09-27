import { validationFailed } from "@storevia/types";
import type { CheckoutAddress } from "./pricing";

// Checkout form input (ADR-0031 §1). Everything a shopper types is bounded,
// trimmed and shaped here, before it reaches pricing or the database; empty
// optional fields become null. Messages are safe to show next to the field.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const REGION_RE = /^[A-Z0-9-]{1,10}$/;
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

const LIMITS: Readonly<Record<Field, { max: number; required: boolean; label: string }>> = {
  firstName: { max: 100, required: true, label: "first name" },
  lastName: { max: 100, required: true, label: "last name" },
  company: { max: 100, required: false, label: "company" },
  line1: { max: 200, required: true, label: "address" },
  line2: { max: 200, required: false, label: "apartment, suite, etc." },
  city: { max: 100, required: true, label: "city" },
  region: { max: 100, required: false, label: "state or region" },
  regionCode: { max: 10, required: false, label: "state or region code" },
  postalCode: { max: 20, required: false, label: "postal code" },
  countryCode: { max: 2, required: true, label: "country" },
  phone: { max: 32, required: false, label: "phone" },
};

/**
 * An address from form fields (`prefix` + field name, e.g. "shipping_line1").
 * Country and region codes are upper-cased; a phone may hold digits, spaces
 * and + ( ) - only.
 */
export function parseAddress(
  input: Readonly<Record<string, unknown>>,
  prefix = "",
): CheckoutAddress {
  const errors: Record<string, string> = {};
  const values: Partial<Record<Field, string | null>> = {};
  for (const [field, rule] of Object.entries(LIMITS) as [Field, (typeof LIMITS)[Field]][]) {
    let value = text(input[`${prefix}${field}`]);
    if (field === "countryCode" || field === "regionCode") value = value.toUpperCase();
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
  const country = values.countryCode;
  if (country && !COUNTRY_RE.test(country)) errors[`${prefix}countryCode`] = "Choose a country.";
  const region = values.regionCode;
  if (region && !REGION_RE.test(region)) {
    errors[`${prefix}regionCode`] = "Use the state or region code, like KA or CA.";
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
    region: values.region ?? null,
    regionCode: values.regionCode ?? null,
    postalCode: values.postalCode ?? null,
    countryCode: values.countryCode ?? "",
    phone: values.phone ?? null,
  };
}

/** An address read back from the checkout row (it was written by parseAddress). */
export function storedAddress(value: unknown): CheckoutAddress | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  try {
    return parseAddress(value as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** A discount code as stored (upper-case), or a field error. */
export function parseDiscountCode(value: unknown): string {
  const code = text(value).toUpperCase();
  if (!code) throw validationFailed({ code: "Enter a discount code." });
  if (!CODE_RE.test(code)) throw validationFailed({ code: "That code isn't valid." });
  return code;
}
