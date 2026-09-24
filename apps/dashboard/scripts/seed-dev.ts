// Development seed: demo tenants created through the real tenancy services.
// Refuses to run in production. Idempotent (skips users that already exist).
//
//   pnpm seed:dev
//
// Accounts (password: storevia-dev-password):
//   owner@acme.test      OWNER of "Acme Supplies" (stores: acme-flagship, acme-outlet)
//   designer@acme.test   DESIGNER in Acme
//   owner@globex.test    OWNER of "Globex Home" (store: globex-home)
//   staff@storevia.test  Platform staff (SUPER_ADMIN), no merchant memberships
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "@storevia/auth";
import { disconnectAll, withTenant } from "@storevia/database";
import { systemDb } from "@storevia/database/system";
import {
  createOrganisation,
  createStore,
  listMyOrganisations,
  listStores,
  requireOrganisationAccess,
  type Principal,
} from "@storevia/tenancy";
import { toTypeId, uuidv7 } from "@storevia/types";
import pg from "pg";

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
  country = "IN",
  currency = "INR",
  locale = "en-IN",
  timezone = "Asia/Kolkata",
) => ({
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
) {
  const existing = (await listMyOrganisations(owner)).find(
    (o) => o.name === name && o.role === "OWNER",
  )?.id;
  const organisationId =
    existing ?? (await createOrganisation(owner, { name, country })).organisationId;
  const ctx = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
  const existingSlugs = new Set((await listStores(ctx)).map((s) => s.slug));
  for (const input of stores) if (!existingSlugs.has(input.slug)) await createStore(ctx, input);
  return organisationId;
}

async function main(): Promise<void> {
  const acmeOwner = (await user("owner@acme.test", "Priya Sharma")).principal;
  const acmeId = await ensureOrganisation(acmeOwner, "Acme Supplies", "IN", [
    store("Acme Flagship", "acme-flagship"),
    store("Acme Outlet", "acme-outlet"),
  ]);
  const designer = (await user("designer@acme.test", "Dev Designer")).principal;
  await withTenant(
    { organisationId: acmeId, storeId: null, userId: acmeOwner.userId },
    async (tx) => {
      const member = await tx.membership.findFirst({
        where: { organisationId: acmeId, userId: designer.userId },
      });
      if (!member)
        await tx.membership.create({
          data: { organisationId: acmeId, userId: designer.userId, role: "DESIGNER" },
        });
    },
  );

  const globexOwner = (await user("owner@globex.test", "Jordan Lee")).principal;
  await ensureOrganisation(globexOwner, "Globex Home", "GB", [
    store("Globex Home", "globex-home", "GB", "GBP", "en-GB", "Europe/London"),
  ]);

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

  console.log(
    `Seeded development data. Sign in with any seeded email and the password "${PASSWORD}".`,
  );
}

try {
  await main();
} finally {
  await disconnectAll();
}
