import { isSupportedLocale, SUPPORTED_CURRENCIES, SUPPORTED_LOCALES } from "@storevia/validation";
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

const languageNames = new Intl.DisplayNames(["en"], {
  type: "language",
  languageDisplay: "standard",
});

/**
 * English only at launch (SF-3): "English (India)", "English (United
 * Kingdom)"… The server accepts only these for new values; a store that
 * already has another locale keeps it (the settings form lists it too).
 */
export const LOCALE_OPTIONS = SUPPORTED_LOCALES.map((tag) => ({
  value: tag,
  label: languageNames.of(tag) ?? tag,
}));

/** The label for a stored locale, including one that is no longer offered. */
export function localeLabel(tag: string): string {
  try {
    return languageNames.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * The language choices for a store's settings: the supported locales, plus
 * the store's own when it chose one before the English-only launch (it may
 * keep it, but can't switch back to it once changed).
 */
export function localeOptionsFor(current: string): { value: string; label: string }[] {
  if (isSupportedLocale(current)) return LOCALE_OPTIONS;
  return [
    { value: current, label: `${localeLabel(current)} (no longer offered)` },
    ...LOCALE_OPTIONS,
  ];
}

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

/** The English locale for a country when there is one ("en-SG"), else US English. */
function englishLocaleFor(country: string): string {
  const tag = `en-${country}`;
  return isSupportedLocale(tag) ? tag : "en-US";
}

/** Sensible defaults from the organisation's country. The language is always English (SF-3). */
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
      return { currency: "AED", locale: "en-AE", timezone: "Asia/Dubai", country: "AE" };
    default:
      return {
        currency: "USD",
        locale: englishLocaleFor(country ?? "US"),
        timezone: "UTC",
        country: country ?? "US",
      };
  }
}
