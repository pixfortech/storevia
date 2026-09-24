// Drops and recreates the dev (default) or test database, applies all
// migrations and loads reference data. Never runs against production.
import { execFileSync } from "node:child_process";
import pg from "pg";
import { applyTarget, loadRootEnv, requireEnv } from "./env";

loadRootEnv();
if (process.env["STOREVIA_ENV"] === "production") {
  throw new Error("db:reset refuses to run in production");
}
const { target, database } = applyTarget();
const migrator = decodeURIComponent(new URL(requireEnv("DATABASE_MIGRATOR_URL")).username);
const others = [
  "DATABASE_URL",
  "DATABASE_SYSTEM_URL",
  "DATABASE_PLATFORM_URL",
  "DATABASE_BILLING_URL",
  "DATABASE_WORKER_URL",
].map((key) => `"${decodeURIComponent(new URL(requireEnv(key)).username)}"`);

const admin = new pg.Client({ connectionString: requireEnv("DATABASE_ADMIN_URL") });
await admin.connect();
try {
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}" OWNER "${migrator}"`);
  await admin.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
  await admin.query(`GRANT CONNECT ON DATABASE "${database}" TO ${others.join(", ")}`);
} finally {
  await admin.end();
}

execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});
// Reference data (plans) is part of a usable database, including the test one.
execFileSync("pnpm", ["exec", "tsx", "scripts/seed.ts"], { stdio: "inherit", env: process.env });
console.log(`reset ${target} database ${database}`);
