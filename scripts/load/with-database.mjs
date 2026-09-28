#!/usr/bin/env node
// Runs a command with every application role URL pointed at another
// database on the same server (the load-test database, never the dev or
// test one other work uses):
//
//   node scripts/load/with-database.mjs storevia_load pnpm --filter @storevia/dashboard seed:load
//
// Reads the repository root .env first (variables already set win), then
// rewrites the database path of each DATABASE_*_URL except the admin URL.
// The same rewrite as withDatabase() in packages/database/scripts/env.ts.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const [database, command, ...args] = process.argv.slice(2);
if (!database || !command || !/^[a-z_][a-z0-9_]*$/.test(database)) {
  console.error("usage: node scripts/load/with-database.mjs <database> <command> [args...]");
  process.exit(2);
}
if (database === "storevia" || database.endsWith("_test")) {
  console.error(`refusing to point load work at "${database}" (development or test database)`);
  process.exit(2);
}

const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

for (const [key, value] of Object.entries(process.env)) {
  if (!/^DATABASE_[A-Z]+_URL$|^DATABASE_URL$/.test(key) || key === "DATABASE_ADMIN_URL") continue;
  if (!value) continue;
  const url = new URL(value);
  url.pathname = `/${database}`;
  process.env[key] = url.toString();
}

const child = spawn(command, args, { stdio: "inherit", env: process.env, shell: false });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
