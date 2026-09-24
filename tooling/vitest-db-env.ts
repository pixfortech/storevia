// Points every database role URL at the *_test database before tests run.
// Used both as a Vitest globalSetup and setupFile so workers inherit it.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnv = resolve(import.meta.dirname, "../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);

process.env["STOREVIA_ENV"] = "test";
const base = new URL(process.env["DATABASE_URL"] ?? "postgresql://localhost/storevia");
const testDb =
  process.env["STOREVIA_TEST_DATABASE"] ??
  (base.pathname.endsWith("_test") ? base.pathname.slice(1) : `${base.pathname.slice(1)}_test`);
for (const key of [
  "DATABASE_URL",
  "DATABASE_MIGRATOR_URL",
  "DATABASE_SYSTEM_URL",
  "DATABASE_PLATFORM_URL",
  "DATABASE_BILLING_URL",
]) {
  const value = process.env[key];
  if (!value) continue;
  const url = new URL(value);
  url.pathname = `/${testDb}`;
  process.env[key] = url.toString();
}

export default function setup(): void {
  // Environment is prepared at import time (above).
}
