// Creates the database roles and the dev + test databases on a local or CI
// PostgreSQL server. Production roles are created by infrastructure-as-code.
// Requires DATABASE_ADMIN_URL (a superuser, needed to grant BYPASSRLS).
import pg from "pg";
import { databaseName, loadRootEnv, requireEnv } from "./env";

loadRootEnv();

if (process.env["STOREVIA_ENV"] === "production") {
  throw new Error("db:setup is for local development and CI only");
}

interface RoleSpec {
  readonly urlVar: string;
  readonly attributes: string;
}

const ROLES: readonly RoleSpec[] = [
  { urlVar: "DATABASE_MIGRATOR_URL", attributes: "LOGIN BYPASSRLS CREATEDB" },
  { urlVar: "DATABASE_URL", attributes: "LOGIN NOBYPASSRLS" },
  { urlVar: "DATABASE_SYSTEM_URL", attributes: "LOGIN BYPASSRLS" },
  { urlVar: "DATABASE_PLATFORM_URL", attributes: "LOGIN BYPASSRLS" },
];

const ident = (value: string) => `"${value.replaceAll('"', '""')}"`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function main(): Promise<void> {
  const admin = new pg.Client({ connectionString: requireEnv("DATABASE_ADMIN_URL") });
  await admin.connect();
  try {
    const credentials = ROLES.map((role) => {
      const url = new URL(requireEnv(role.urlVar));
      return {
        ...role,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
    });

    for (const role of credentials) {
      const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role.user]);
      const verb = exists.rowCount ? "ALTER" : "CREATE";
      await admin.query(
        `${verb} ROLE ${ident(role.user)} WITH ${role.attributes} PASSWORD ${literal(role.password)}`,
      );
      console.log(`${verb === "CREATE" ? "created" : "updated"} role ${role.user}`);
    }

    const migrator = credentials[0]?.user ?? "storevia_migrator";
    const others = credentials.slice(1).map((r) => ident(r.user));
    const devDb = databaseName(requireEnv("DATABASE_URL"));
    const testDb = process.env["STOREVIA_TEST_DATABASE"] ?? `${devDb}_test`;
    for (const database of [devDb, testDb]) {
      const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
      if (!exists.rowCount) {
        await admin.query(`CREATE DATABASE ${ident(database)} OWNER ${ident(migrator)}`);
        console.log(`created database ${database}`);
      }
      await admin.query(`REVOKE ALL ON DATABASE ${ident(database)} FROM PUBLIC`);
      await admin.query(`GRANT CONNECT ON DATABASE ${ident(database)} TO ${others.join(", ")}`);
    }
  } finally {
    await admin.end();
  }
}

await main();
