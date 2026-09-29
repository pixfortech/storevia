import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "../../database/scripts/reference-data";
import { FEATURE_AVAILABILITY, isFeatureAvailable } from "./availability";
import { FEATURE_KEYS, type FeatureKey } from "./features";

// Plan data never sells what isn't built (MK-5). A plan may grant a planned
// feature (the entitlement is ready for when it ships), but the words a
// merchant reads (plan descriptions, feature descriptions) name only what
// exists today. Every feature key needs an entry here, so a new feature
// can't skip the check.
const WORDS: Readonly<Record<FeatureKey, RegExp>> = {
  store_count: /\bstores?\b/i,
  staff_accounts: /\bteam\b|\bstaff\b/i,
  product_limit: /\bproducts?\b/i,
  media_storage: /\bmedia\b|\bstorage\b/i,
  custom_domain: /\bdomains?\b/i,
  visual_builder: /\bpage builder\b/i,
  advanced_builder: /\b(full|advanced) (page )?builder\b|interaction components/i,
  premium_themes: /\bpremium themes?\b/i,
  analytics: /\banalytics\b|\breports?\b/i,
  discounts: /\bdiscount codes?\b/i,
  abandoned_cart: /\babandoned\b/i,
  api_access: /\bapi\b/i,
  webhooks: /\bwebhooks?\b/i,
  custom_code: /\bcustom code\b/i,
  advanced_permissions: /\bstore-limited\b|\bpermissions\b/i,
  export: /\bexport\b/i,
  priority_support: /\bpriority support\b|\bfaster responses\b/i,
};

const planned = FEATURE_KEYS.filter((key) => !isFeatureAvailable(key));

/** Every Feature description the migrations have set, latest last. */
function featureDescriptions(): Map<string, string> {
  const dir = join(import.meta.dirname, "..", "..", "database", "prisma", "migrations");
  const descriptions = new Map<string, string>();
  for (const name of readdirSync(dir).sort()) {
    let sql: string;
    try {
      sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    } catch {
      continue;
    }
    // Rows inserted by the reference migration: (id, 'key', 'Name', 'Description', ...
    for (const m of sql.matchAll(/\(gen_random_uuid\(\), '([a-z_]+)', '[^']*', '([^']*)'/g)) {
      descriptions.set(m[1] ?? "", m[2] ?? "");
    }
    // Later copy corrections: UPDATE "Feature" SET description = '...' WHERE key = '...'
    for (const m of sql.matchAll(
      /UPDATE "Feature"\s+SET description = '([^']*)'\s+WHERE key = '([a-z_]+)'/g,
    )) {
      descriptions.set(m[2] ?? "", m[1] ?? "");
    }
  }
  return descriptions;
}

describe("plan reference data sells only what exists", () => {
  it("has an availability for every feature", () => {
    expect(Object.keys(FEATURE_AVAILABILITY).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(planned.length).toBeGreaterThan(0);
  });

  it("no plan description names a planned feature", () => {
    for (const plan of PLANS) {
      for (const key of planned) {
        expect(WORDS[key].test(plan.description), `${plan.key}: ${key}`).toBe(false);
      }
    }
  });

  it("the words catch what they stand for", () => {
    expect(WORDS.advanced_builder.test("Several stores, a larger team and the full builder.")).toBe(
      true,
    );
    expect(WORDS.advanced_builder.test("Several stores and a larger team.")).toBe(false);
  });

  it("the discounts feature describes codes only: automatic discounts aren't built", () => {
    const descriptions = featureDescriptions();
    expect([...descriptions.keys()].sort()).toEqual([...FEATURE_KEYS].sort());
    expect(descriptions.get("discounts")).toMatch(/discount codes/i);
    for (const [key, description] of descriptions) {
      expect(description, key).not.toMatch(/automatic discount/i);
    }
  });
});
