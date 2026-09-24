import { z } from "zod";

/** Trims and collapses internal whitespace. */
const cleanText = (value: string) => value.trim().replace(/\s+/g, " ");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long.")
  .pipe(z.email("Enter a valid email address."));

/**
 * Password policy (docs/architecture/04-auth-rbac.md §3): 10-128 characters,
 * no composition rules. Breached-password screening happens in packages/auth.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`);

export const personNameSchema = z
  .string()
  .transform(cleanText)
  .pipe(z.string().min(1, "Enter your name.").max(100, "Name is too long."));

export const displayNameSchema = (label: string) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, `Enter a ${label} name.`).max(100, `The ${label} name is too long.`));

/** ISO-4217 currencies Storevia supports for stores (exponent table in commerce, M3). */
export const SUPPORTED_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "SGD",
  "AED",
  "JPY",
  "NZD",
  "ZAR",
  "CHF",
] as const;
export const currencySchema = z.enum(SUPPORTED_CURRENCIES, "Choose a supported currency.");

/** ISO-3166-1 alpha-2, upper case. Full list validated via Intl.DisplayNames. */
export const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Choose a country.")
  .refine((code) => {
    const name = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(code);
    return name !== undefined;
  }, "Choose a country.");

export const localeSchema = z
  .string()
  .trim()
  .max(35)
  .refine((tag) => {
    try {
      return Intl.getCanonicalLocales(tag).length === 1;
    } catch {
      return false;
    }
  }, "Choose a valid locale.");

export const timezoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine(
    (zone) => {
      // supportedValuesOf() lists only canonical IDs (e.g. Asia/Calcutta on some
      // ICU builds), so validate by construction instead.
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(zone);
      } catch {
        return false;
      }
    },
    { message: "Choose a valid time zone." },
  );

/** Flattens zod issues into { field: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}
