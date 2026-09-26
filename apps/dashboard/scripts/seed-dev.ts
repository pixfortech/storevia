// Development seed: demo tenants created through the real tenancy services.
// Refuses to run in production. Idempotent (skips users that already exist).
//
//   pnpm seed:dev
//
// Accounts (password: storevia-dev-password):
//   owner@acme.test      OWNER of "Acme Supplies" (Business plan; stores: acme-flagship, acme-outlet)
//   designer@acme.test   DESIGNER in Acme
//   owner@globex.test    OWNER of "Globex Home" (Starter trial; store: globex-home)
//   staff@storevia.test  Platform staff (SUPER_ADMIN), signs in at PLATFORM_ADMIN_URL
//
// Catalogue (seed-catalogue.ts, fictional, no sales):
//   acme-flagship  7 products (5 active, 1 draft, 1 archived), 12 variants, two
//                  collections, Main location and Bengaluru warehouse, one
//                  product low on stock and two variants out of stock; its
//                  storefront is live at http://acme-flagship.store.localhost:3002
//   globex-home    3 products, at a product limit of 3 (staff override)
//
// Plans are assigned through the real Subscription Service as that staff
// member (ADR-0022), exactly as platform-admin would.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "@storevia/auth";
import { assignPlan } from "@storevia/billing";
import { disconnectAll, withTenant } from "@storevia/database";
import { platformDb } from "@storevia/database/platform";
import { systemDb } from "@storevia/database/system";
import { consumeUsage } from "@storevia/entitlements";
import {
  createOrganisation,
  createStore,
  listMyOrganisations,
  listStores,
  requireOrganisationAccess,
  requireStoreAccess,
  type Principal,
} from "@storevia/tenancy";
import { requirePlatformStaff, type PlatformContext } from "@storevia/tenancy/platform";
import { toTypeId, uuidv7 } from "@storevia/types";
import pg from "pg";
import { seedAcmeCatalogue, seedGlobexAtLimit } from "./seed-catalogue";

const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (process.env["STOREVIA_ENV"] === "production")
  throw new Error("seed:dev refuses to run in production");

const PASSWORD = "storevia-dev-password";

async function user(
  email: string,
  name: string,
): Promise<{ principal: Principal; created: boolean }> {
  const db = systemDb();
  const existing = await db.user.findUnique({ where: { email } });
  const principal = (id: string): Principal => ({
    userId: id,
    email,
    name,
    emailVerified: true,
    recentlyAuthenticated: false,
  });
  if (existing) return { principal: principal(existing.id), created: false };
  const id = uuidv7();
  await db.user.create({ data: { id, email, name, emailVerified: true } });
  await db.account.create({
    data: {
      id: uuidv7(),
      userId: id,
      providerId: "credential",
      accountId: id,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  return { principal: principal(id), created: true };
}

const store = (
  name: string,
  slug: string,
  businessType: "ECOMMERCE" | "BUSINESS" | "PUBLISHING" | "PORTFOLIO" = "ECOMMERCE",
  country = "IN",
  currency = "INR",
  locale = "en-IN",
  timezone = "Asia/Kolkata",
) => ({
  businessType,
  name,
  slug,
  country,
  currency,
  locale,
  timezone,
});

async function ensureOrganisation(
  owner: Principal,
  name: string,
  country: string,
  stores: ReturnType<typeof store>[],
  plan: { staff: PlatformContext; planKey: string; status: "ACTIVE" | "TRIAL" },
) {
  const existing = (await listMyOrganisations(owner)).find(
    (o) => o.name === name && o.role === "OWNER",
  )?.id;
  const organisationId =
    existing ?? (await createOrganisation(owner, { name, country })).organisationId;
  const live = await platformDb().subscription.findFirst({
    where: { organisationId, status: { not: "EXPIRED" } },
  });
  if (!live) {
    await assignPlan(plan.staff, {
      organisationId: toTypeId("organisation", organisationId),
      planKey: plan.planKey,
      status: plan.status,
      billingInterval: "MONTH",
      reason: "Development seed",
    });
  }
  const ctx = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
  const existingSlugs = new Set((await listStores(ctx)).map((s) => s.slug));
  for (const input of stores) if (!existingSlugs.has(input.slug)) await createStore(ctx, input);
  return organisationId;
}

async function main(): Promise<void> {
  // Granting platform access is an operations action: the application roles
  // can't write PlatformStaff, so use the schema owner (migrator) here.
  const staff = (await user("staff@storevia.test", "Storevia Staff")).principal;
  const migratorUrl = process.env["DATABASE_MIGRATOR_URL"];
  if (!migratorUrl) throw new Error("DATABASE_MIGRATOR_URL is not set");
  const admin = new pg.Client({ connectionString: migratorUrl });
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO "PlatformStaff" ("userId", role, "updatedAt") VALUES ($1::uuid, 'SUPER_ADMIN', now())
       ON CONFLICT ("userId") DO NOTHING`,
      [staff.userId],
    );
  } finally {
    await admin.end();
  }

  // The seed acts as that staff member, with step-up (it holds the password).
  const staffCtx = await requirePlatformStaff({ ...staff, recentlyAuthenticated: true });

  const acmeOwner = (await user("owner@acme.test", "Priya Sharma")).principal;
  const acmeId = await ensureOrganisation(
    acmeOwner,
    "Acme Supplies",
    "IN",
    [
      store("Acme Flagship", "acme-flagship"),
      store("Acme Outlet", "acme-outlet"),
      store("The Acme Journal", "acme-journal", "PUBLISHING"),
    ],
    { staff: staffCtx, planKey: "business", status: "ACTIVE" },
  );
  const designer = (await user("designer@acme.test", "Dev Designer")).principal;
  await withTenant(
    { organisationId: acmeId, storeId: null, userId: acmeOwner.userId },
    async (tx) => {
      const member = await tx.membership.findFirst({
        where: { organisationId: acmeId, userId: designer.userId },
      });
      if (!member) {
        await consumeUsage(tx, acmeId, "staff_accounts");
        await tx.membership.create({
          data: { organisationId: acmeId, userId: designer.userId, role: "DESIGNER" },
        });
      }
    },
  );

  const globexOwner = (await user("owner@globex.test", "Jordan Lee")).principal;
  const globexId = await ensureOrganisation(
    globexOwner,
    "Globex Home",
    "GB",
    [store("Globex Home", "globex-home", "ECOMMERCE", "GB", "GBP", "en-GB", "Europe/London")],
    { staff: staffCtx, planKey: "starter", status: "TRIAL" },
  );

  // One organisation per remaining business type, for design review.
  const studioOwner = (await user("owner@studionorth.test", "Maya Okafor")).principal;
  await ensureOrganisation(
    studioOwner,
    "Studio North",
    "GB",
    [
      store("Studio North", "studio-north", "PORTFOLIO", "GB", "GBP", "en-GB", "Europe/London"),
      store(
        "North & Co Architects",
        "north-and-co",
        "BUSINESS",
        "GB",
        "GBP",
        "en-GB",
        "Europe/London",
      ),
    ],
    { staff: staffCtx, planKey: "business", status: "ACTIVE" },
  );

  const storeContext = async (owner: Principal, organisationId: string, slug: string) => {
    const org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
    const found = (await listStores(org)).find((s) => s.slug === slug);
    if (!found) throw new Error(`store ${slug} is missing`);
    return requireStoreAccess(owner, toTypeId("store", found.id));
  };
  if (await seedAcmeCatalogue(await storeContext(acmeOwner, acmeId, "acme-flagship")))
    console.log("Seeded the Acme Flagship catalogue.");
  if (
    await seedGlobexAtLimit(
      staffCtx,
      globexId,
      await storeContext(globexOwner, globexId, "globex-home"),
    )
  )
    console.log("Seeded Globex Home at its product limit.");

  console.log(
    `Seeded development data. Sign in with any seeded email and the password "${PASSWORD}".`,
  );
}

try {
  await main();
} finally {
  await disconnectAll();
}
