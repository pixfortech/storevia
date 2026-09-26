// Test-only helpers. Refuses to run against anything but a *_test database.
import { createPrismaClient, disconnectAll, onDatabaseQuery } from "./client";
import { Prisma, type PrismaClient } from "./generated/prisma/client";

let migrator: PrismaClient | undefined;

function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`refusing to use non-test database "${name}" in tests`);
  }
}

/** Schema-owner client (BYPASSRLS) for arranging fixtures. Tests only. */
export function migratorDb(): PrismaClient {
  const url = process.env["DATABASE_MIGRATOR_URL"];
  if (!url) throw new Error("DATABASE_MIGRATOR_URL is not set");
  assertTestDatabase(url);
  migrator ??= createPrismaClient(url);
  return migrator;
}

// Tenant and ledger tables only: the plan catalogue (Plan, PlanPrice,
// Feature, PlanFeature) is reference data loaded by migrations and the seed.
const TABLES = [
  "OutboxEvent",
  "CartLine",
  "Cart",
  "PageVersion",
  "Page",
  "StoreSlugHistory",
  "InventoryMovement",
  "InventoryLevel",
  "InventoryItem",
  "Location",
  "CollectionProduct",
  "Collection",
  "ProductMedia",
  "ProductVariantOptionValue",
  "ProductVariant",
  "ProductOptionValue",
  "ProductOption",
  "Product",
  "MediaAsset",
  "JobRun",
  "ScheduledJob",
  "SubscriptionEvent",
  "Subscription",
  "OrganisationFeatureOverride",
  "UsageCounter",
  "BillingCustomer",
  "BillingWebhookEvent",
  "AuditLog",
  "MembershipStoreAccess",
  "StoreDomain",
  "Invitation",
  "Membership",
  "Store",
  "PlatformStaff",
  "Organisation",
  "Session",
  "Account",
  "Verification",
  "RateLimit",
  "User",
] as const;

/** Removes all rows from every table (fast, keeps the schema). */
export async function truncateAll(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await migratorDb().$executeRaw(Prisma.raw(`TRUNCATE ${list} CASCADE`));
}

export async function disconnectTestClients(): Promise<void> {
  await migrator?.$disconnect();
  migrator = undefined;
  await disconnectAll();
}

// Transaction plumbing is not a query for the budget (06 §10).
const PLUMBING = /^(BEGIN|COMMIT|ROLLBACK|SET TRANSACTION|SELECT\s+set_config\()/i;

/**
 * Runs `fn` and returns the data statements it sent (M4-09 query budget).
 * Requires STOREVIA_QUERY_EVENTS=1 (set by tooling/vitest-db-env.ts).
 */
export async function countQueries<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; queries: string[] }> {
  const queries: string[] = [];
  const stop = onDatabaseQuery((query) => {
    if (!PLUMBING.test(query.trim())) queries.push(query);
  });
  try {
    return { result: await fn(), queries };
  } finally {
    stop();
  }
}
