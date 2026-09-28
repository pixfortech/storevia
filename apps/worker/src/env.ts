import { getDomainProvisioner } from "@storevia/domains/provisioner";
import { getEmailSender } from "@storevia/email";
import { storageFromEnv } from "@storevia/media";
import {
  databaseUrlSchema,
  liveRules,
  loadEnv,
  runBootChecks,
  secretSchema,
  stageSchema,
} from "@storevia/security/env";
import { z } from "zod";

// The worker's whole configuration (ADR-0023), validated before it claims a
// job: a bad deploy exits at start instead of failing jobs one by one.
const schema = z.object({
  STOREVIA_ENV: stageSchema,
  DATABASE_WORKER_URL: databaseUrlSchema,
  DATABASE_BILLING_URL: databaseUrlSchema,
  // Links in emails (order pages, billing).
  DASHBOARD_URL: z.url(),
  // Cache invalidations are posted to the storefront.
  STOREFRONT_INTERNAL_URL: z.url(),
  STOREFRONT_REVALIDATE_SECRET: secretSchema(),
  // Shoppers' order links in emails; derived in development and test.
  ORDER_ACCESS_SECRET: secretSchema().optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(60_000).default(5_000),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(3004),
  WORKER_HEALTH_HOST: z.string().min(1).default("127.0.0.1"),
});

export type WorkerEnv = z.infer<typeof schema>;

const rules = [
  liveRules<WorkerEnv>({
    nonLocal: ["ORDER_ACCESS_SECRET"],
    secrets: ["STOREFRONT_REVALIDATE_SECRET", "ORDER_ACCESS_SECRET"],
    databaseUrls: ["DATABASE_WORKER_URL", "DATABASE_BILLING_URL"],
  }),
];

/** Throws a ConfigurationError naming every missing or malformed setting. */
export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  const env = loadEnv("worker", schema, rules, source);
  if (env.STOREVIA_ENV === "development") return env;
  runBootChecks("worker", {
    email: () => {
      getEmailSender();
      return null;
    },
    media: () => {
      storageFromEnv();
      return null;
    },
    domains: () => {
      getDomainProvisioner();
      return null;
    },
  });
  return env;
}
