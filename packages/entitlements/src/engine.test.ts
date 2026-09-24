import { describe, expect, it } from "vitest";
import {
  fitsLimit,
  isEntitling,
  isGranted,
  isOverLimit,
  limitOf,
  resolveFeature,
  toValue,
  type EntitlingFields,
  type FeatureRow,
  type ValueColumns,
} from "./engine";

const now = new Date("2026-09-25T12:00:00Z");
const later = new Date("2026-09-26T12:00:00Z");
const earlier = new Date("2026-09-24T12:00:00Z");

const sub = (fields: Partial<EntitlingFields>): EntitlingFields => ({
  status: "ACTIVE",
  trialEndsAt: null,
  expiresAt: null,
  graceEndsAt: null,
  ...fields,
});

const value = (v: Partial<ValueColumns>): ValueColumns => ({
  enabled: true,
  limit: null,
  unlimited: false,
  config: null,
  ...v,
});

const storeCount: FeatureRow = {
  id: "f-store",
  key: "store_count",
  name: "Stores",
  type: "LIMIT",
  sortOrder: 0,
  defaults: value({ limit: 1n }),
};
const customDomain: FeatureRow = {
  id: "f-domain",
  key: "custom_domain",
  name: "Custom domains",
  type: "BOOLEAN",
  sortOrder: 0,
  defaults: value({ enabled: false }),
};
const analytics: FeatureRow = {
  id: "f-analytics",
  key: "analytics",
  name: "Analytics",
  type: "CONFIGURATION",
  sortOrder: 0,
  defaults: value({ enabled: false }),
};

describe("isEntitling (the single, source-independent rule)", () => {
  it.each([
    ["no subscription", null, false],
    ["TRIAL before its end", sub({ status: "TRIAL", trialEndsAt: later }), true],
    ["TRIAL at its end", sub({ status: "TRIAL", trialEndsAt: now }), false],
    ["TRIAL after its end", sub({ status: "TRIAL", trialEndsAt: earlier }), false],
    ["TRIAL without an end (invalid row) fails closed", sub({ status: "TRIAL" }), false],
    ["ACTIVE without expiry", sub({ status: "ACTIVE" }), true],
    ["ACTIVE before a fixed expiry", sub({ status: "ACTIVE", expiresAt: later }), true],
    ["ACTIVE after a fixed expiry", sub({ status: "ACTIVE", expiresAt: earlier }), false],
    ["PAST_DUE within grace", sub({ status: "PAST_DUE", graceEndsAt: later }), true],
    ["PAST_DUE after grace", sub({ status: "PAST_DUE", graceEndsAt: earlier }), false],
    ["PAST_DUE without grace fails closed", sub({ status: "PAST_DUE" }), false],
    ["CANCELLED before access ends", sub({ status: "CANCELLED", expiresAt: later }), true],
    ["CANCELLED after access ends", sub({ status: "CANCELLED", expiresAt: earlier }), false],
    ["CANCELLED without access end fails closed", sub({ status: "CANCELLED" }), false],
    ["EXPIRED", sub({ status: "EXPIRED", expiresAt: later }), false],
  ])("%s", (_, subscription, expected) => {
    expect(isEntitling(subscription, now)).toBe(expected);
  });
});

describe("toValue (four entitlement kinds)", () => {
  it("BOOLEAN", () => {
    expect(toValue("BOOLEAN", value({ enabled: true }))).toEqual({
      kind: "BOOLEAN",
      enabled: true,
    });
    expect(toValue("BOOLEAN", value({ enabled: false }))).toEqual({
      kind: "BOOLEAN",
      enabled: false,
    });
  });
  it("LIMIT and UNLIMITED", () => {
    expect(toValue("LIMIT", value({ limit: 3n }))).toEqual({ kind: "LIMIT", limit: 3n });
    expect(toValue("LIMIT", value({ unlimited: true }))).toEqual({ kind: "UNLIMITED" });
    expect(toValue("LIMIT", value({ enabled: false, unlimited: true }))).toEqual({
      kind: "LIMIT",
      limit: 0n,
    });
    // An inconsistent row (enabled, no limit, not unlimited) fails closed.
    expect(toValue("LIMIT", value({}))).toEqual({ kind: "LIMIT", limit: 0n });
    expect(toValue("LIMIT", value({ limit: -5n }))).toEqual({ kind: "LIMIT", limit: 0n });
  });
  it("CONFIGURATION", () => {
    expect(toValue("CONFIGURATION", value({ config: { retentionDays: 90 } }))).toEqual({
      kind: "CONFIGURATION",
      enabled: true,
      config: { retentionDays: 90 },
    });
    expect(toValue("CONFIGURATION", value({ config: [1, 2] }))).toEqual({
      kind: "CONFIGURATION",
      enabled: false,
      config: {},
    });
  });
});

describe("resolveFeature precedence: override → plan → system default", () => {
  it("falls back to the system default without a plan value or override", () => {
    const r = resolveFeature(storeCount, undefined, undefined, now);
    expect(r).toMatchObject({ origin: "DEFAULT", value: { kind: "LIMIT", limit: 1n } });
  });

  it("uses the plan value over the default", () => {
    const r = resolveFeature(storeCount, value({ limit: 3n }), undefined, now);
    expect(r).toMatchObject({ origin: "PLAN", value: { kind: "LIMIT", limit: 3n } });
  });

  it("uses an active override over the plan", () => {
    const override = { ...value({ limit: 20n }), featureId: storeCount.id, expiresAt: later };
    const r = resolveFeature(storeCount, value({ limit: 3n }), override, now);
    expect(r).toMatchObject({
      origin: "OVERRIDE",
      value: { kind: "LIMIT", limit: 20n },
      overrideExpiresAt: later,
    });
  });

  it("an override can also restrict (disable a plan feature)", () => {
    const override = { ...value({ enabled: false }), featureId: customDomain.id, expiresAt: null };
    const r = resolveFeature(customDomain, value({ enabled: true }), override, now);
    expect(r).toMatchObject({ origin: "OVERRIDE", value: { kind: "BOOLEAN", enabled: false } });
  });

  it("ignores an expired override", () => {
    const override = {
      ...value({ unlimited: true }),
      featureId: storeCount.id,
      expiresAt: earlier,
    };
    expect(resolveFeature(storeCount, value({ limit: 3n }), override, now).origin).toBe("PLAN");
    expect(resolveFeature(storeCount, undefined, override, now).origin).toBe("DEFAULT");
  });

  it("an override expiring exactly now no longer applies", () => {
    const override = { ...value({ unlimited: true }), featureId: storeCount.id, expiresAt: now };
    expect(resolveFeature(storeCount, undefined, override, now).origin).toBe("DEFAULT");
  });

  it("resolves configuration values", () => {
    const r = resolveFeature(analytics, value({ config: { retentionDays: 365 } }), undefined, now);
    expect(r.value).toEqual({
      kind: "CONFIGURATION",
      enabled: true,
      config: { retentionDays: 365 },
    });
  });
});

describe("limits", () => {
  it("isGranted / limitOf", () => {
    expect(isGranted({ kind: "LIMIT", limit: 0n })).toBe(false);
    expect(isGranted({ kind: "LIMIT", limit: 1n })).toBe(true);
    expect(isGranted({ kind: "UNLIMITED" })).toBe(true);
    expect(limitOf({ kind: "UNLIMITED" })).toBe("unlimited");
    expect(limitOf({ kind: "LIMIT", limit: 7n })).toBe(7n);
    expect(limitOf({ kind: "BOOLEAN", enabled: false })).toBe(0n);
  });

  it("fitsLimit / isOverLimit", () => {
    expect(fitsLimit(2n, 1n, 1n)).toBe(true);
    expect(fitsLimit(2n, 2n, 1n)).toBe(false);
    expect(fitsLimit(0n, 0n, 1n)).toBe(false);
    expect(fitsLimit("unlimited", 10_000n, 1n)).toBe(true);
    expect(isOverLimit(1n, 3n)).toBe(true);
    expect(isOverLimit(3n, 3n)).toBe(false);
    expect(isOverLimit("unlimited", 3n)).toBe(false);
  });
});
