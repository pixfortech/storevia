// Reference data seed (idempotent; safe in every environment). Loads the plan
// catalogue from reference-data.ts as the schema owner. Feature rows come from
// migrations; this script fails if a plan names a feature that doesn't exist
// or leaves one out. Demo tenants for local development are created by
// `pnpm db:seed:dev` (apps/dashboard) through the real services.
import { createPrismaClient } from "../src/client";
import { Prisma } from "../src/generated/prisma/client";
import { applyTarget, loadRootEnv, requireEnv } from "./env";
import { PLANS, type SeedValue } from "./reference-data";

loadRootEnv();
const { database } = applyTarget();
const db = createPrismaClient(requireEnv("DATABASE_MIGRATOR_URL"));

function toColumns(value: SeedValue) {
  if ("limit" in value)
    return { enabled: true, limit: BigInt(value.limit), unlimited: false, config: Prisma.DbNull };
  if ("unlimited" in value)
    return { enabled: true, limit: null, unlimited: true, config: Prisma.DbNull };
  if ("config" in value)
    return {
      enabled: true,
      limit: null,
      unlimited: false,
      config: value.config as Prisma.InputJsonObject,
    };
  return { enabled: value.enabled, limit: null, unlimited: false, config: Prisma.DbNull };
}

try {
  const features = await db.feature.findMany({ select: { id: true, key: true } });
  const featureIds = new Map(features.map((f) => [f.key, f.id]));

  for (const plan of PLANS) {
    const keys = Object.keys(plan.features);
    const unknown = keys.filter((k) => !featureIds.has(k));
    const missing = [...featureIds.keys()].filter((k) => !keys.includes(k));
    if (unknown.length || missing.length) {
      throw new Error(
        `plan ${plan.key}: unknown features [${unknown.join(", ")}], missing [${missing.join(", ")}]`,
      );
    }

    await db.$transaction(async (tx) => {
      const { id: planId } = await tx.plan.upsert({
        where: { key: plan.key },
        create: {
          key: plan.key,
          name: plan.name,
          description: plan.description,
          sortOrder: plan.sortOrder,
          trialDays: plan.trialDays,
          isPublic: plan.isPublic,
        },
        update: {
          name: plan.name,
          description: plan.description,
          sortOrder: plan.sortOrder,
          trialDays: plan.trialDays,
          isPublic: plan.isPublic,
        },
        select: { id: true },
      });

      // Prices are immutable: a changed amount retires the old row.
      const active = await tx.planPrice.findMany({ where: { planId, active: true } });
      for (const row of active) {
        const wanted = plan.prices.find(
          (p) => p.interval === row.interval && p.currency === row.currency,
        );
        if (wanted?.amount !== row.amount) {
          await tx.planPrice.update({ where: { id: row.id }, data: { active: false } });
        }
      }
      for (const price of plan.prices) {
        const current = active.find(
          (r) =>
            r.interval === price.interval &&
            r.currency === price.currency &&
            r.amount === price.amount,
        );
        if (!current) await tx.planPrice.create({ data: { planId, ...price } });
      }

      for (const [key, value] of Object.entries(plan.features)) {
        const featureId = featureIds.get(key) ?? "";
        const columns = toColumns(value);
        await tx.planFeature.upsert({
          where: { planId_featureId: { planId, featureId } },
          create: { planId, featureId, ...columns },
          update: columns,
        });
      }
    });
    console.log(`seeded plan ${plan.key}`);
  }
  console.log(`reference data loaded into ${database}`);
} finally {
  await db.$disconnect();
}
