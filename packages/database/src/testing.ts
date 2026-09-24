// Test-only helpers. Refuses to run against anything but a *_test database.
import { createPrismaClient, disconnectAll } from "./client";
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

const TABLES = [
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
