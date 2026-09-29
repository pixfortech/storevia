import "server-only";
import {
  databaseUrlSchema,
  flagSchema,
  isLiveStage,
  liveRules,
  loadEnv,
  optionalSchema,
  secretSchema,
  stageSchema,
} from "@storevia/security/env";
import { z } from "zod";

/** An optional http(s) URL where "" means unset (as .env files write it). */
const optionalWebUrl = optionalSchema.pipe(
  z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }).optional(),
);

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
  // DB-3: the one place merchants get help ("Help and support" in the
  // account menu, and every "contact support" line). Unset, it is the
  // marketing site's contact page (MARKETING_URL + /contact); one of the two
  // is required in staging and production. See supportUrl().
  SUPPORT_URL: optionalWebUrl,
  MARKETING_URL: optionalWebUrl,
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
    isLiveStage(value.STOREVIA_ENV) && !value.SUPPORT_URL && !value.MARKETING_URL
      ? [
          {
            path: "SUPPORT_URL",
            message: "set SUPPORT_URL or MARKETING_URL in staging and production",
          },
        ]
      : [],
  (value: DashboardEnv) =>
    value.STOREVIA_ENV === "production" && value.STOREFRONT_PROTOCOL !== "https"
      ? [{ path: "STOREFRONT_PROTOCOL", message: "must be https in production" }]
      : [],
];

/** Parses a configuration source (process.env by default); exported for tests. */
export function parseDashboardEnv(
  source: Record<string, string | undefined> = process.env,
): DashboardEnv {
  return loadEnv("dashboard", schema, rules, source);
}

let cached: DashboardEnv | undefined;

export function env(): DashboardEnv {
  cached ??= parseDashboardEnv();
  return cached;
}

export const isDevelopment = () => process.env.NODE_ENV !== "production";

/** Local development's marketing site, when neither URL is configured. */
const LOCAL_MARKETING_URL = "http://localhost:3000";

/**
 * Where "Help and support" leads (DB-3): SUPPORT_URL, else the marketing
 * site's contact page. Pure, so the choice is unit-tested.
 */
export function resolveSupportUrl(
  config: Pick<DashboardEnv, "SUPPORT_URL" | "MARKETING_URL">,
): string {
  if (config.SUPPORT_URL) return config.SUPPORT_URL;
  const marketing = (config.MARKETING_URL ?? LOCAL_MARKETING_URL).replace(/\/+$/, "");
  return `${marketing}/contact`;
}

export const supportUrl = (): string => resolveSupportUrl(env());
