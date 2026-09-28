// Backup and restore drill (M8, docs/operations/backup-restore.md).
//
//   pnpm --filter @storevia/database db:restore-drill [--source=<database>] [--keep]
//     [--self-test] [--report=<file.json>]
//   DRILL_SOURCE_URL=<source on another server> … db:restore-drill
//
// 1. Backs the source database up with pg_dump (custom format) as the
//    schema owner, and records the dump's size and SHA-256.
// 2. Restores it into a new, empty database (`<source>_restore_drill`)
//    with pg_restore in one transaction, as the admin role, so owners and
//    grants come back exactly.
// 3. Verifies the copy: every table's row count and content checksum
//    matches the source (organisations, stores, products, orders,
//    payments, customers, themes, domains and messages are reported by
//    name); RLS, policies, functions, role grants and the migration head
//    match; the storefront role can resolve a live store and the
//    application role sees no tenant rows without a tenant scope.
// 4. Prints the timings (the recovery time for this data size) and drops
//    the copy unless --keep. --self-test removes one order from the copy
//    first and passes only if the verification reports it.
//
// Never runs against production (a production restore goes to a Neon
// branch or a new project first; see the runbook). Prints database names,
// counts and checksums only: never connection strings or row contents.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { databaseName, loadRootEnv, requireEnv, withDatabase } from "./env";

loadRootEnv();
if (["production", "staging"].includes(process.env["STOREVIA_ENV"] ?? "")) {
  throw new Error("db:restore-drill runs against local or drill databases only");
}
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const keep = process.argv.includes("--keep");
// --self-test damages the copy (one row removed, triggers bypassed) and
// expects the verification to catch it: proof the drill can fail.
const selfTest = process.argv.includes("--self-test");

const migratorUrl = requireEnv("DATABASE_MIGRATOR_URL");
const adminUrl = requireEnv("DATABASE_ADMIN_URL");
const source =
  arg("source") ??
  (process.env["DRILL_SOURCE_URL"]
    ? databaseName(process.env["DRILL_SOURCE_URL"])
    : databaseName(migratorUrl));
const target = `${source}_restore_drill`;
if (!/^[a-z0-9_]+$/.test(source)) throw new Error("source must be a plain database name");
// Another server's database (e.g. staging, read with its migrator role) can
// be the source; the copy is always made on DATABASE_ADMIN_URL's server.
const sourceUrl = process.env["DRILL_SOURCE_URL"] ?? withDatabase(migratorUrl, source);
const targetAdminUrl = withDatabase(adminUrl, target);
const role = (key: string) => decodeURIComponent(new URL(requireEnv(key)).username);

/** Tables the runbook names explicitly (all tables are verified). */
const NAMED = [
  "Organisation",
  "Store",
  "Product",
  "ProductVariant",
  "Order",
  "OrderLine",
  "Payment",
  "Refund",
  "Customer",
  "StoreTheme",
  "StoreDomain",
  "OrderMessage",
  "Subscription",
  "AuditLog",
] as const;

const timings: Record<string, number> = {};
async function timed<T>(step: string, work: () => T | Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await work();
  timings[step] = Math.round(performance.now() - started);
  return result;
}

async function withClient<T>(url: string, work: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

// ---- 1. Backup ---------------------------------------------------------------
const dir = join(tmpdir(), "storevia-drill");
mkdirSync(dir, { recursive: true });
const dumpFile = join(dir, `${source}-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
await timed("backup", () => {
  execFileSync("pg_dump", ["--format=custom", "--no-password", "--file", dumpFile, sourceUrl], {
    stdio: ["ignore", "ignore", "inherit"],
  });
});
const dump = readFileSync(dumpFile);
const dumpSha256 = createHash("sha256").update(dump).digest("hex");
const dumpBytes = statSync(dumpFile).size;

// ---- 2. Restore into a clean database ------------------------------------------
const roles = [
  "DATABASE_URL",
  "DATABASE_SYSTEM_URL",
  "DATABASE_PLATFORM_URL",
  "DATABASE_BILLING_URL",
  "DATABASE_WORKER_URL",
  "DATABASE_MARKETING_URL",
  "DATABASE_STOREFRONT_URL",
  "DATABASE_CHECKOUT_URL",
].map((key) => `"${role(key)}"`);
await timed("create_database", () =>
  withClient(adminUrl, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS "${target}" WITH (FORCE)`);
    await c.query(`CREATE DATABASE "${target}" OWNER "${role("DATABASE_MIGRATOR_URL")}"`);
    await c.query(`REVOKE ALL ON DATABASE "${target}" FROM PUBLIC`);
    await c.query(`GRANT CONNECT ON DATABASE "${target}" TO ${roles.join(", ")}`);
  }),
);
await timed("restore", () => {
  execFileSync(
    "pg_restore",
    [
      "--exit-on-error",
      "--single-transaction",
      "--no-password",
      "--dbname",
      targetAdminUrl,
      dumpFile,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
});

if (selfTest) {
  await withClient(targetAdminUrl, async (c) => {
    await c.query(`SET session_replication_role = replica`);
    await c.query(`DELETE FROM "Order" WHERE id = (SELECT id FROM "Order" ORDER BY id LIMIT 1)`);
  });
}

// ---- 3. Verify -----------------------------------------------------------------
interface TableFingerprint {
  readonly rows: number;
  readonly checksum: string;
}

async function fingerprint(url: string) {
  return withClient(url, async (c) => {
    const tables = (
      await c.query<{ name: string }>(
        `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
      )
    ).rows.map((r) => r.name);
    const data: Record<string, TableFingerprint> = {};
    for (const name of tables) {
      const { rows } = await c.query<{ rows: string; checksum: string | null }>(
        `SELECT count(*)::text AS rows,
           md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS checksum
         FROM "${name}" t`,
      );
      data[name] = { rows: Number(rows[0]?.rows ?? 0), checksum: rows[0]?.checksum ?? "" };
    }
    const one = async (sql: string) => (await c.query<{ v: string }>(sql)).rows[0]?.v ?? "";
    const structure = {
      rlsTables: await one(
        `SELECT string_agg(relname, ',' ORDER BY relname) AS v FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity`,
      ),
      policies: await one(
        `SELECT md5(string_agg(tablename || ':' || policyname || ':' || coalesce(qual, '') || ':' ||
           coalesce(with_check, ''), '|' ORDER BY tablename, policyname)) AS v FROM pg_policies
         WHERE schemaname = 'public'`,
      ),
      functions: await one(
        `SELECT md5(string_agg(f, '|' ORDER BY f)) AS v FROM (
           SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' ||
             md5(p.prosrc) || p.prosecdef::text AS f
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace) fns`,
      ),
      grants: await one(
        `SELECT md5(string_agg(grantee || ':' || table_name || ':' || privilege_type, '|'
           ORDER BY grantee, table_name, privilege_type)) AS v
         FROM information_schema.role_table_grants WHERE table_schema = 'public'`,
      ),
      functionGrants: await one(
        `SELECT md5(string_agg(grantee || ':' || routine_name, '|' ORDER BY grantee, routine_name)) AS v
         FROM information_schema.role_routine_grants WHERE routine_schema = 'public'`,
      ),
      migrationHead: await one(
        `SELECT migration_name AS v FROM _prisma_migrations
         WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`,
      ),
    };
    return { data, structure };
  });
}

const [before, after] = await timed("verify_fingerprints", () =>
  Promise.all([fingerprint(sourceUrl), fingerprint(withDatabase(migratorUrl, target))]),
);
const problems: string[] = [];
for (const [name, fp] of Object.entries(before.data)) {
  const copy = after.data[name];
  if (!copy) problems.push(`table ${name} is missing from the restore`);
  else if (copy.rows !== fp.rows || copy.checksum !== fp.checksum)
    problems.push(`table ${name} differs (${String(fp.rows)} vs ${String(copy.rows)} rows)`);
}
for (const name of Object.keys(after.data)) {
  if (!(name in before.data)) problems.push(`table ${name} exists only in the restore`);
}
for (const [key, value] of Object.entries(before.structure)) {
  if (after.structure[key as keyof typeof after.structure] !== value)
    problems.push(`${key} differs after restore`);
}

// Functional: the restored copy behaves like the original for the roles.
const functional = await timed("verify_roles", async () => {
  const host = await withClient(sourceUrl, async (c) => {
    const { rows } = await c.query<{ hostname: string }>(
      `SELECT d.hostname FROM "StoreDomain" d JOIN "Store" s ON s.id = d."storeId"
       JOIN "Organisation" o ON o.id = s."organisationId"
       WHERE d.status = 'ACTIVE' AND d."isPrimary" AND s.status = 'ACTIVE' AND o.status = 'ACTIVE'
       ORDER BY d.hostname LIMIT 1`,
    );
    return rows[0]?.hostname ?? null;
  });
  const resolves = host
    ? await withClient(
        withDatabase(requireEnv("DATABASE_STOREFRONT_URL"), target),
        async (c) =>
          Number(
            (
              await c.query<{ n: string }>(
                `SELECT count(*)::text AS n FROM app_storefront_resolve($1)`,
                [host],
              )
            ).rows[0]?.n ?? 0,
          ) === 1,
      )
    : null;
  const unscopedOrders = await withClient(
    withDatabase(requireEnv("DATABASE_URL"), target),
    async (c) =>
      Number(
        (await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM "Order"`)).rows[0]?.n ?? -1,
      ),
  );
  return { liveStoreResolves: resolves, appRoleSeesUnscopedOrders: unscopedOrders };
});
if (functional.liveStoreResolves === false) problems.push("a live store does not resolve");
if (functional.appRoleSeesUnscopedOrders !== 0) problems.push("RLS is not enforced after restore");

// ---- 4. Report -------------------------------------------------------------------
if (!keep) {
  await withClient(adminUrl, (c) => c.query(`DROP DATABASE IF EXISTS "${target}" WITH (FORCE)`));
}
const report = {
  source,
  target: keep ? target : `${target} (dropped)`,
  dump: { bytes: dumpBytes, sha256: dumpSha256 },
  tables: Object.keys(before.data).length,
  rows: Object.values(before.data).reduce((n, t) => n + t.rows, 0),
  named: Object.fromEntries(NAMED.map((n) => [n, before.data[n]?.rows ?? null])),
  structure: { migrationHead: before.structure.migrationHead },
  functional,
  timingsMs: timings,
  recoveryMs: (timings["create_database"] ?? 0) + (timings["restore"] ?? 0),
  problems,
  ok: selfTest ? problems.some((p) => p.startsWith("table Order ")) : problems.length === 0,
  ...(selfTest
    ? { selfTest: "one Order row removed from the copy; the drill must report it" }
    : {}),
};
const reportFile = arg("report");
if (reportFile) writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
