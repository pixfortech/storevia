// Cron entry point: `pnpm --filter @storevia/billing billing:sweep`.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { disconnectAll } from "@storevia/database";
import { sweepSubscriptionExpiry } from "../src/sweep";

const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);

try {
  const { expired } = await sweepSubscriptionExpiry();
  console.log(`expired ${String(expired)} subscription(s)`);
} finally {
  await disconnectAll();
}
