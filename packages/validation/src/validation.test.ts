import { describe, expect, it } from "vitest";
import {
  countrySchema,
  emailSchema,
  normaliseSlug,
  passwordSchema,
  personNameSchema,
  storeSlugSchema,
  timezoneSchema,
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
  it("trims person names and keeps them to 1-100 characters (profile, DB-4)", () => {
    expect(personNameSchema.parse("  Asha   Rao \n")).toBe("Asha Rao");
    expect(personNameSchema.safeParse("   ").success).toBe(false);
    expect(personNameSchema.safeParse("").success).toBe(false);
    expect(personNameSchema.parse("x".repeat(100))).toHaveLength(100);
    expect(personNameSchema.safeParse("x".repeat(101)).success).toBe(false);
    // Surrounding space doesn't count towards the limit.
    expect(personNameSchema.parse(` ${"x".repeat(100)} `)).toHaveLength(100);
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
