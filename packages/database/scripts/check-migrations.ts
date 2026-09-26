import { migrationStatus } from "../src/migration-status";
import { databaseName, loadRootEnv, requireEnv } from "./env";

// `pnpm db:check`: stops with a clear message when the database is behind
// the code (run by `pnpm dev` before anything starts). Prints the database
// name only, never the connection URL.
loadRootEnv();
const url = requireEnv("DATABASE_MIGRATOR_URL");
const status = await migrationStatus(url);
const name = databaseName(url);
if (status.failed.length > 0) {
  console.error(
    `Database "${name}" has failed migrations: ${status.failed.join(", ")}.\n` +
      "Resolve them (see docs/database/data-lifecycle.md) before starting Storevia.",
  );
  process.exit(1);
}
if (status.pending.length > 0) {
  console.error(
    `Database "${name}" is ${String(status.pending.length)} migration(s) behind the code:\n` +
      status.pending.map((m) => `  - ${m}`).join("\n") +
      "\nRun `pnpm db:migrate`, then start again.",
  );
  process.exit(1);
}
console.log(`Database "${name}" is up to date.`);
