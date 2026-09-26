// `pnpm db:check` (run by `pnpm dev`): a database behind the code is refused
// with the list of missing migrations, instead of failing later in
// confusing ways (an old CHECK constraint rejecting new rows, a missing
// table in a background job).
import { describe, expect, it } from "vitest";
import { compareMigrations, migrationStatus, migrationsOnDisk } from "../src/migration-status";

const applied = (name: string, finished = true, rolledBack = false) => ({
  name,
  finished,
  rolledBack,
});

describe("migration status", () => {
  it("lists migrations on disk that never finished, in order", () => {
    expect(compareMigrations(["a", "b", "c"], [applied("a")])).toEqual({
      pending: ["b", "c"],
      failed: [],
    });
    expect(compareMigrations(["a", "b"], [applied("a"), applied("b")])).toEqual({
      pending: [],
      failed: [],
    });
  });

  it("reports failed migrations separately, and a retried one as applied", () => {
    expect(compareMigrations(["a", "b"], [applied("a"), applied("b", false)])).toEqual({
      pending: [],
      failed: ["b"],
    });
    expect(
      compareMigrations(["a", "b"], [applied("a"), applied("b", false, true), applied("b")]),
    ).toEqual({ pending: [], failed: [] });
    expect(compareMigrations(["a"], [applied("a", false, true)])).toEqual({
      pending: ["a"],
      failed: [],
    });
  });

  it("the migrated test database is up to date, and a newer migration on disk shows as pending", async () => {
    const url = process.env["DATABASE_MIGRATOR_URL"] ?? "";
    const onDisk = migrationsOnDisk();
    expect(onDisk.length).toBeGreaterThan(10);
    expect(await migrationStatus(url, onDisk)).toEqual({ pending: [], failed: [] });
    expect(await migrationStatus(url, [...onDisk, "29990101000000_from_the_future"])).toEqual({
      pending: ["29990101000000_from_the_future"],
      failed: [],
    });
  });
});
