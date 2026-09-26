import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "./generated/prisma/client";

export type DatabaseRole =
  "app" | "system" | "platform" | "billing" | "worker" | "marketing" | "storefront";

const URL_ENV: Record<DatabaseRole, string> = {
  app: "DATABASE_URL",
  system: "DATABASE_SYSTEM_URL",
  platform: "DATABASE_PLATFORM_URL",
  billing: "DATABASE_BILLING_URL",
  worker: "DATABASE_WORKER_URL",
  marketing: "DATABASE_MARKETING_URL",
  storefront: "DATABASE_STOREFRONT_URL",
};

// One client (and pg pool) per role per process. Cached on globalThis so that
// development hot reloads don't open a new pool on every change.
const globalCache = globalThis as typeof globalThis & {
  __storeviaPrisma?: Partial<Record<DatabaseRole, PrismaClient>>;
};

type QueryListener = (query: string) => void;
const queryListeners = new Set<QueryListener>();

/**
 * Subscribes to every statement sent by clients created while
 * STOREVIA_QUERY_EVENTS=1 (tests only: the query-count harness, M4-09).
 * Returns the unsubscribe function.
 */
export function onDatabaseQuery(listener: QueryListener): () => void {
  queryListeners.add(listener);
  return () => queryListeners.delete(listener);
}

/**
 * A pg client that runs promise-style queries one at a time.
 *
 * Prisma's query interpreter loads included relations in parallel. Inside an
 * interactive transaction (every withTenant call, where the RLS settings
 * live) all of them go through the transaction's single connection, and pg
 * queues the overlapping calls with a deprecation warning; pg@9 refuses
 * them. Chaining each call after the previous one keeps the transaction on
 * its one connection (so its RLS scope is untouched) and never has two
 * queries in flight on it. Callback-style calls (the pool's own) and
 * submittables (cursors) pass straight through.
 */
// Always called with an explicit client via apply(), never detached.
// eslint-disable-next-line @typescript-eslint/unbound-method
const baseQuery = pg.Client.prototype.query as (this: pg.Client, ...args: unknown[]) => unknown;

export class SerialClient extends pg.Client {
  #tail: Promise<unknown> = Promise.resolve();

  // Typed as a pass-through: pg's query has a dozen overloads and this only
  // reorders calls, it never changes what is sent or returned.
  override query(...args: unknown[]): never {
    const [config, values, callback] = args;
    const submittable = typeof config === "object" && config !== null && "submit" in config;
    if (submittable || typeof values === "function" || typeof callback === "function") {
      return baseQuery.apply(this, args) as never;
    }
    const run = () => baseQuery.apply(this, args) as Promise<unknown>;
    const result = this.#tail.then(run, run);
    this.#tail = result.catch(() => undefined);
    return result as never;
  }
}

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env["DATABASE_POOL_MAX"] ?? 10),
    Client: SerialClient,
  });
  if (process.env["STOREVIA_QUERY_EVENTS"] !== "1") return new PrismaClient({ adapter });
  const client = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
  client.$on("query", (event) => {
    for (const listener of queryListeners) listener(event.query);
  });
  return client;
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
