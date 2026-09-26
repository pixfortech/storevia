import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

// Is the database schema behind the code? (`pnpm db:check`, run before
// `pnpm dev`.) Code written for a migration fails in confusing ways against
// a database that doesn't have it (a CHECK constraint from an older
// migration, a missing table), so development refuses to start until
// `pnpm db:migrate` has run. Reads only Prisma's migration table.

export interface AppliedMigration {
  readonly name: string;
  readonly finished: boolean;
  readonly rolledBack: boolean;
}

export interface MigrationStatus {
  /** On disk, never applied. */
  readonly pending: readonly string[];
  /** Started but never finished (and not rolled back): needs attention. */
  readonly failed: readonly string[];
}

export const MIGRATIONS_DIR = resolve(import.meta.dirname, "../prisma/migrations");

export function migrationsOnDisk(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}

export function compareMigrations(
  onDisk: readonly string[],
  applied: readonly AppliedMigration[],
): MigrationStatus {
  const done = new Set(applied.filter((m) => m.finished && !m.rolledBack).map((m) => m.name));
  const failed = applied
    .filter((m) => !m.finished && !m.rolledBack && !done.has(m.name))
    .map((m) => m.name);
  return {
    pending: onDisk.filter((name) => !done.has(name) && !failed.includes(name)),
    failed: [...new Set(failed)].sort(),
  };
}

/** The status of the database at `connectionString` (every migration pending if none ever ran). */
export async function migrationStatus(
  connectionString: string,
  onDisk = migrationsOnDisk(),
): Promise<MigrationStatus> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const table = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists",
    );
    if (!table.rows[0]?.exists) return { pending: onDisk, failed: [] };
    const rows = await client.query<{ name: string; finished: boolean; rolled_back: boolean }>(
      `SELECT migration_name AS name, finished_at IS NOT NULL AS finished,
              rolled_back_at IS NOT NULL AS rolled_back
       FROM _prisma_migrations`,
    );
    return compareMigrations(
      onDisk,
      rows.rows.map((r) => ({ name: r.name, finished: r.finished, rolledBack: r.rolled_back })),
    );
  } finally {
    await client.end();
  }
}
