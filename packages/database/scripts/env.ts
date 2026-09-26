import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Loads the repository root .env (if present) for CLI scripts. */
export function loadRootEnv(): void {
  const file = resolve(import.meta.dirname, "../../../.env");
  if (existsSync(file)) process.loadEnvFile(file);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

/** The same connection URL pointing at a different database. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/**
 * Target selection: `--target=test` (or `STOREVIA_DB_TARGET=test`) switches
 * every role URL to the test database. The flag form works in every shell,
 * including Windows cmd; the choice is exported so child scripts inherit it.
 */
export function applyTarget(): { target: "dev" | "test"; database: string } {
  const target =
    process.argv.includes("--target=test") || process.env["STOREVIA_DB_TARGET"] === "test"
      ? "test"
      : "dev";
  process.env["STOREVIA_DB_TARGET"] = target;
  const base = databaseName(requireEnv("DATABASE_URL"));
  // Idempotent: child scripts inherit URLs that already point at the test DB.
  const alreadyTest = base.endsWith("_test");
  const database =
    target === "test" && !alreadyTest
      ? (process.env["STOREVIA_TEST_DATABASE"] ?? `${base}_test`)
      : base;
  for (const key of ROLE_URL_VARS) {
    const url = process.env[key];
    if (url) process.env[key] = withDatabase(url, database);
  }
  return { target, database };
}

export const ROLE_URL_VARS = [
  "DATABASE_URL",
  "DATABASE_MIGRATOR_URL",
  "DATABASE_SYSTEM_URL",
  "DATABASE_PLATFORM_URL",
  "DATABASE_BILLING_URL",
  "DATABASE_WORKER_URL",
  "DATABASE_MARKETING_URL",
  "DATABASE_STOREFRONT_URL",
] as const;
