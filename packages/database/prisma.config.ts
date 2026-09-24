import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env files; load the repository root .env if present.
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations always run as the schema owner (storevia_migrator), never as
  // the application role. See docs/architecture/03-tenancy.md §5.3.
  datasource: { url: process.env["DATABASE_MIGRATOR_URL"] ?? "" },
});
