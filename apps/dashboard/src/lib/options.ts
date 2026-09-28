import { SUPPORTED_CURRENCIES } from "@storevia/validation";
import { countries } from "@storevia/validation/geo";

// Option lists for forms. Countries come from the geo reference data (the
// list shipping zones, tax rates and addresses are checked against);
// currency names are built with Intl so they are correct and localisable
// (docs 01 §7 i18n). The server validates every value anyway.

/** Sorted by English name. */
export const COUNTRY_OPTIONS = countries.map((c) => ({ value: c.code, label: c.name }));

const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

export const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((code) => ({
  value: code,
  label: `${code} · ${currencyNames.of(code) ?? code}`,
}));

export const LOCALE_OPTIONS = [
  { value: "en-IN", label: "English (India)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "hi-IN", label: "Hindi (India)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "ar-AE", label: "Arabic (UAE)" },
  { value: "ja-JP", label: "Japanese (Japan)" },
] as const;

export const TIMEZONE_OPTIONS = [
  "Asia/Kolkata",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Jakarta",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Africa/Johannesburg",
].map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));

/** Sensible defaults from the organisation's country. */
export function defaultsForCountry(country: string | null | undefined) {
  switch (country) {
    case "IN":
      return { currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", country: "IN" };
    case "GB":
      return { currency: "GBP", locale: "en-GB", timezone: "Europe/London", country: "GB" };
    case "US":
      return { currency: "USD", locale: "en-US", timezone: "America/New_York", country: "US" };
    case "AU":
      return { currency: "AUD", locale: "en-AU", timezone: "Australia/Sydney", country: "AU" };
    case "AE":
      return { currency: "AED", locale: "ar-AE", timezone: "Asia/Dubai", country: "AE" };
    default:
      return { currency: "USD", locale: "en-US", timezone: "UTC", country: country ?? "US" };
  }
}
