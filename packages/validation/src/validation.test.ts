import { describe, expect, it } from "vitest";
import {
  countrySchema,
  createStoreSchema,
  emailSchema,
  isSupportedLocale,
  normaliseSlug,
  passwordSchema,
  storeSlugSchema,
  SUPPORTED_LOCALE_MESSAGE,
  SUPPORTED_LOCALES,
  timezoneSchema,
  updateStoreSchema,
} from "./index";

describe("storeSlugSchema", () => {
  it.each(["acme", "acme-store", "a1b", "x".repeat(40)])("accepts %s", (slug) => {
    expect(storeSlugSchema.safeParse(slug).success).toBe(true);
  });
  it.each([
    "ab",
    "-acme",
    "acme-",
    "ac--me",
    "Acme Store",
    "acme_store",
    "x".repeat(41),
    "admin",
    "api",
    "www",
    "storevia",
    "my-storevia-shop",
    "acmé",
  ])("rejects %s", (slug) => {
    expect(storeSlugSchema.safeParse(slug).success).toBe(false);
  });
  it("normalises names into slugs", () => {
    expect(normaliseSlug("  Café Déjà Vu!  ")).toBe("cafe-deja-vu");
    expect(normaliseSlug("---")).toBe("");
  });
});

describe("common schemas", () => {
  it("lower-cases and validates emails", () => {
    expect(emailSchema.parse("  Alice@Example.COM ")).toBe("alice@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
  it("enforces the password length policy", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("long enough pass").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  });
  it("validates countries and time zones", () => {
    expect(countrySchema.parse("in")).toBe("IN");
    expect(countrySchema.safeParse("XX").success).toBe(false);
    expect(timezoneSchema.safeParse("Asia/Kolkata").success).toBe(true);
    expect(timezoneSchema.safeParse("Mars/Base").success).toBe(false);
  });
});

describe("store languages (SF-3)", () => {
  const store = {
    name: "Acme",
    slug: "acme",
    currency: "INR",
    country: "IN",
    timezone: "Asia/Kolkata",
  };

  it("offers English locales only, each one Intl formats as itself", () => {
    for (const tag of SUPPORTED_LOCALES) {
      expect(tag).toMatch(/^en-[A-Z]{2}$/);
      expect(Intl.getCanonicalLocales(tag)).toEqual([tag]);
      expect(new Intl.NumberFormat(tag).resolvedOptions().locale).toBe(tag);
    }
    expect(new Set(SUPPORTED_LOCALES).size).toBe(SUPPORTED_LOCALES.length);
  });

  it("creates stores only in a supported language", () => {
    expect(createStoreSchema.safeParse({ ...store, locale: "en-IN" }).success).toBe(true);
    for (const locale of ["hi-IN", "ar-AE", "fr-FR", "ja-JP", "en", "not a locale"]) {
      const result = createStoreSchema.safeParse({ ...store, locale });
      expect(result.success, locale).toBe(false);
      expect(result.error?.issues[0]?.message, locale).toBe(SUPPORTED_LOCALE_MESSAGE);
    }
  });

  it("still accepts a valid stored locale on update (the store decides whether it may change)", () => {
    const update = { name: "Acme", timezone: "UTC", contactEmail: "", supportEmail: "" };
    expect(updateStoreSchema.safeParse({ ...update, locale: "hi-IN" }).success).toBe(true);
    expect(updateStoreSchema.safeParse({ ...update, locale: "not a locale!" }).success).toBe(false);
    expect(isSupportedLocale("en-GB")).toBe(true);
    expect(isSupportedLocale("hi-IN")).toBe(false);
  });
});
