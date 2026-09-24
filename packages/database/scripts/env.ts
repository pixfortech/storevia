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

/** Target selection: `STOREVIA_DB_TARGET=test` switches every role URL to the test database. */
export function applyTarget(): { target: "dev" | "test"; database: string } {
  const target = process.env["STOREVIA_DB_TARGET"] === "test" ? "test" : "dev";
  const base = databaseName(requireEnv("DATABASE_URL"));
  const database =
    target === "test" ? (process.env["STOREVIA_TEST_DATABASE"] ?? `${base}_test`) : base;
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
] as const;
