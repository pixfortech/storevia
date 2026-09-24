// Pricing ↔ catalogue consistency (ADR-0025): the public catalogue is exactly
// the Plan / Feature data, read through the marketing role, resolved with the
// same value rules the engine enforces.
import { marketingDb } from "@storevia/database/marketing";
import { disconnectTestClients, migratorDb } from "@storevia/database/testing";
import { afterAll, describe, expect, it } from "vitest";
import { PLANS, type SeedValue } from "../../database/scripts/reference-data";
import { loadPublicCatalogue } from "../src/catalogue";
import type { EntitlementValue } from "../src/engine";
import { FEATURE_KEYS } from "../src/features";

afterAll(disconnectTestClients);

function expected(seed: SeedValue): EntitlementValue {
  if ("enabled" in seed) return { kind: "BOOLEAN", enabled: seed.enabled };
  if ("unlimited" in seed) return { kind: "UNLIMITED" };
  if ("limit" in seed) return { kind: "LIMIT", limit: BigInt(seed.limit) };
  return { kind: "CONFIGURATION", enabled: true, config: seed.config };
}

describe("public catalogue", () => {
  it("matches the reference plan data exactly", async () => {
    const catalogue = await loadPublicCatalogue(marketingDb());
    const publicPlans = PLANS.filter((p) => p.isPublic).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(catalogue.plans.map((p) => p.key)).toEqual(publicPlans.map((p) => p.key));
    expect(catalogue.features.map((f) => f.key).sort()).toEqual([...FEATURE_KEYS].sort());
    for (const seed of publicPlans) {
      const plan = catalogue.plans.find((p) => p.key === seed.key);
      expect(plan?.name).toBe(seed.name);
      expect(plan?.prices.map((p) => [p.interval, p.currency, p.amount]).sort()).toEqual(
        seed.prices.map((p) => [p.interval, p.currency, p.amount]).sort(),
      );
      for (const key of FEATURE_KEYS) {
        const value = seed.features[key];
        if (!value) throw new Error(`${seed.key} has no ${key}`);
        expect(plan?.values[key], `${seed.key}.${key}`).toEqual(expected(value));
      }
    }
  });

  it("leaves out archived and private plans, and follows data changes without code", async () => {
    const db = migratorDb();
    const starter = await db.plan.findUniqueOrThrow({ where: { key: "starter" } });
    try {
      await db.plan.update({ where: { id: starter.id }, data: { status: "ARCHIVED" } });
      expect((await loadPublicCatalogue(marketingDb())).plans.map((p) => p.key)).not.toContain(
        "starter",
      );
      await db.plan.update({
        where: { id: starter.id },
        data: { status: "ACTIVE", isPublic: false },
      });
      expect((await loadPublicCatalogue(marketingDb())).plans.map((p) => p.key)).not.toContain(
        "starter",
      );
      await db.plan.update({
        where: { id: starter.id },
        data: { isPublic: true, name: "Starter (renamed)" },
      });
      const renamed = (await loadPublicCatalogue(marketingDb())).plans.find(
        (p) => p.key === "starter",
      );
      expect(renamed?.name).toBe("Starter (renamed)");
    } finally {
      await db.plan.update({
        where: { id: starter.id },
        data: { status: starter.status, isPublic: starter.isPublic, name: starter.name },
      });
    }
  });

  it("the free allowance is the system defaults", async () => {
    const catalogue = await loadPublicCatalogue(marketingDb());
    expect(catalogue.freeAllowance.store_count).toEqual({ kind: "LIMIT", limit: 1n });
    expect(catalogue.freeAllowance.staff_accounts).toEqual({ kind: "LIMIT", limit: 1n });
  });
});
