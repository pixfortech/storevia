import { SUPPORTED_LOCALES } from "@storevia/validation";
import { describe, expect, it } from "vitest";
import { parseDashboardEnv, resolveSupportUrl } from "./env";
import { LAUNCH_BUSINESS_TYPE_MESSAGE, launchBusinessType } from "./launch-scope";
import { defaultsForCountry, LOCALE_OPTIONS, localeOptionsFor } from "./options";

describe("launch business types (DB-2)", () => {
  it("accepts the online store, and defaults to it", () => {
    expect(launchBusinessType("ECOMMERCE")).toBe("ECOMMERCE");
    expect(launchBusinessType(null)).toBe("ECOMMERCE");
    expect(launchBusinessType("")).toBe("ECOMMERCE");
  });

  it("rejects every other type for a new store, with a clear field error", () => {
    for (const type of ["BUSINESS", "PUBLISHING", "PORTFOLIO", "RESTAURANT"]) {
      expect(() => launchBusinessType(type)).toThrow(
        expect.objectContaining({
          code: "VALIDATION_FAILED",
          fieldErrors: { businessType: LAUNCH_BUSINESS_TYPE_MESSAGE },
        }),
      );
    }
  });

  it("lets an existing store keep its type, or move to a launch type, but not to another", () => {
    expect(launchBusinessType("PUBLISHING", "PUBLISHING")).toBe("PUBLISHING");
    expect(launchBusinessType("ECOMMERCE", "PUBLISHING")).toBe("ECOMMERCE");
    expect(launchBusinessType(null, "PORTFOLIO")).toBe("PORTFOLIO");
    expect(() => launchBusinessType("PORTFOLIO", "PUBLISHING")).toThrow();
    expect(() => launchBusinessType("BUSINESS", "ECOMMERCE")).toThrow();
  });
});

describe("store languages (SF-3)", () => {
  it("offers English locales only, named in English", () => {
    expect(LOCALE_OPTIONS.map((o) => o.value)).toEqual([...SUPPORTED_LOCALES]);
    for (const option of LOCALE_OPTIONS) expect(option.label).toMatch(/^English \(.+\)$/);
    expect(LOCALE_OPTIONS.find((o) => o.value === "en-IN")?.label).toBe("English (India)");
  });

  it("defaults every country to an English locale, keeping currency independent", () => {
    for (const country of ["IN", "GB", "US", "AU", "AE", "SG", "CA", "DE", "JP", "FR", null]) {
      const defaults = defaultsForCountry(country);
      expect(SUPPORTED_LOCALES as readonly string[], String(country)).toContain(defaults.locale);
    }
    expect(defaultsForCountry("AE")).toMatchObject({ locale: "en-AE", currency: "AED" });
    expect(defaultsForCountry("SG")).toMatchObject({ locale: "en-SG", currency: "USD" });
    expect(defaultsForCountry("DE").locale).toBe("en-US");
  });

  it("keeps a store's old locale on its settings form, marked as no longer offered", () => {
    expect(localeOptionsFor("en-GB")).toEqual(LOCALE_OPTIONS);
    const options = localeOptionsFor("hi-IN");
    expect(options[0]).toEqual({ value: "hi-IN", label: "Hindi (India) (no longer offered)" });
    expect(options.slice(1)).toEqual(LOCALE_OPTIONS);
  });
});

describe("support destination (DB-3)", () => {
  const db = (user: string) =>
    `postgresql://${user}:x@db.example.test:5432/storevia?sslmode=require`;
  const staging = {
    STOREVIA_ENV: "staging",
    DASHBOARD_URL: "https://app.staging.storevia.test",
    AUTH_SECRET: "a".repeat(40),
    STOREFRONT_PREVIEW_SECRET: "b".repeat(40),
    TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
    DATABASE_URL: db("app"),
    DATABASE_SYSTEM_URL: db("system"),
    DATABASE_CHECKOUT_URL: db("checkout"),
    DATABASE_BILLING_URL: db("billing"),
  };

  it("needs a support destination in staging and production, and only http(s)", () => {
    expect(() => parseDashboardEnv(staging)).toThrow(
      /SUPPORT_URL: set SUPPORT_URL or MARKETING_URL/,
    );
    expect(
      parseDashboardEnv({ ...staging, MARKETING_URL: "https://storevia.test" }).SUPPORT_URL,
    ).toBeUndefined();
    expect(
      parseDashboardEnv({ ...staging, SUPPORT_URL: "https://help.storevia.test" }).SUPPORT_URL,
    ).toBe("https://help.storevia.test");
    expect(() => parseDashboardEnv({ ...staging, SUPPORT_URL: "javascript:alert(1)" })).toThrow(
      /SUPPORT_URL/,
    );
    // Development falls back to the local marketing site.
    const { STOREVIA_ENV: _stage, ...local } = staging;
    expect(
      parseDashboardEnv({ ...local, STOREVIA_ENV: "development" }).SUPPORT_URL,
    ).toBeUndefined();
  });

  it("uses SUPPORT_URL, else the marketing site's contact page", () => {
    expect(
      resolveSupportUrl({
        SUPPORT_URL: "https://help.storevia.com/",
        MARKETING_URL: "https://storevia.com",
      }),
    ).toBe("https://help.storevia.com/");
    expect(
      resolveSupportUrl({ SUPPORT_URL: undefined, MARKETING_URL: "https://storevia.com/" }),
    ).toBe("https://storevia.com/contact");
    expect(resolveSupportUrl({ SUPPORT_URL: undefined, MARKETING_URL: undefined })).toBe(
      "http://localhost:3000/contact",
    );
  });
});
