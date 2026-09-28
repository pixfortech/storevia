import "server-only";
import {
  databaseUrlSchema,
  flagSchema,
  liveRules,
  loadEnv,
  optionalSchema,
  secretSchema,
  stageSchema,
} from "@storevia/security/env";
import { z } from "zod";

// Fail fast on missing or malformed configuration (docs 02 §5). Validated
// when the server boots (instrumentation.ts) and read lazily afterwards.
const schema = z.object({
  STOREVIA_ENV: stageSchema,
  DASHBOARD_URL: z.url(),
  AUTH_SECRET: secretSchema(),
  DATABASE_URL: databaseUrlSchema,
  DATABASE_SYSTEM_URL: databaseUrlSchema,
  // Payment-provider and billing webhooks land on the dashboard.
  DATABASE_CHECKOUT_URL: databaseUrlSchema,
  DATABASE_BILLING_URL: databaseUrlSchema,
  STOREFRONT_ROOT_DOMAIN: z.string().min(1).default("storevia.site"),
  STOREFRONT_PROTOCOL: z.enum(["http", "https"]).default("https"),
  // Signs the preview links the storefront verifies.
  STOREFRONT_PREVIEW_SECRET: secretSchema(),
  // Without it every client shares one unknown IP and per-IP limits are off.
  TRUSTED_CLIENT_IP_HEADER: optionalSchema,
  DEMO_ORDER_DELETION_ENABLED: flagSchema,
});

export type DashboardEnv = z.infer<typeof schema>;

const rules = [
  liveRules<DashboardEnv>({
    secrets: ["AUTH_SECRET", "STOREFRONT_PREVIEW_SECRET"],
    required: ["TRUSTED_CLIENT_IP_HEADER"],
    databaseUrls: [
      "DATABASE_URL",
      "DATABASE_SYSTEM_URL",
      "DATABASE_CHECKOUT_URL",
      "DATABASE_BILLING_URL",
    ],
  }),
  (value: DashboardEnv) =>
    value.STOREVIA_ENV === "production" && value.STOREFRONT_PROTOCOL !== "https"
      ? [{ path: "STOREFRONT_PROTOCOL", message: "must be https in production" }]
      : [],
];

let cached: DashboardEnv | undefined;

export function env(): DashboardEnv {
  cached ??= loadEnv("dashboard", schema, rules);
  return cached;
}

export const isDevelopment = () => process.env.NODE_ENV !== "production";
