import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type DatabaseRole = "app" | "system" | "platform" | "billing" | "worker" | "marketing";

const URL_ENV: Record<DatabaseRole, string> = {
  app: "DATABASE_URL",
  system: "DATABASE_SYSTEM_URL",
  platform: "DATABASE_PLATFORM_URL",
  billing: "DATABASE_BILLING_URL",
  worker: "DATABASE_WORKER_URL",
  marketing: "DATABASE_MARKETING_URL",
};

// One client (and pg pool) per role per process. Cached on globalThis so that
// development hot reloads don't open a new pool on every change.
const globalCache = globalThis as typeof globalThis & {
  __storeviaPrisma?: Partial<Record<DatabaseRole, PrismaClient>>;
};

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: Number(process.env["DATABASE_POOL_MAX"] ?? 10),
    }),
  });
}

export function getClient(role: DatabaseRole): PrismaClient {
  const cache = (globalCache.__storeviaPrisma ??= {});
  const existing = cache[role];
  if (existing) return existing;
  const url = process.env[URL_ENV[role]];
  if (!url) throw new Error(`${URL_ENV[role]} is not set`);
  const client = createPrismaClient(url);
  cache[role] = client;
  return client;
}

/** Closes every pool opened by this process (tests, scripts, graceful shutdown). */
export async function disconnectAll(): Promise<void> {
  const cache = globalCache.__storeviaPrisma ?? {};
  await Promise.all(Object.values(cache).map((client) => client.$disconnect()));
  globalCache.__storeviaPrisma = {};
}
