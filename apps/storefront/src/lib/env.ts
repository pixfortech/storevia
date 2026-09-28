import {
  databaseUrlSchema,
  liveRules,
  loadEnv,
  optionalSchema,
  runBootChecks,
  secretSchema,
  stageSchema,
} from "@storevia/security/env";
import { credentialsKeysProblem } from "@storevia/payments";
import { z } from "zod";

// The storefront's whole configuration (ADR-0028 §11), validated when the
// server boots (instrumentation.ts). Values are still read where they are
// used; this only makes a bad deploy fail before it serves a shopper.
const schema = z.object({
  STOREVIA_ENV: stageSchema,
  DATABASE_STOREFRONT_URL: databaseUrlSchema,
  DATABASE_CHECKOUT_URL: databaseUrlSchema,
  STOREFRONT_ROOT_DOMAIN: z.string().min(1).default("storevia.site"),
  STOREFRONT_PROTOCOL: z.enum(["http", "https"]).default("https"),
  STOREFRONT_PREVIEW_SECRET: secretSchema(),
  STOREFRONT_REVALIDATE_SECRET: secretSchema(),
  // Signs shoppers' private order links; derived in development and test.
  ORDER_ACCESS_SECRET: secretSchema().optional(),
  ORDER_ACCESS_SECRET_PREVIOUS: secretSchema().optional(),
  // Per-IP limits on carts and checkout need the edge's client-IP header.
  TRUSTED_CLIENT_IP_HEADER: optionalSchema,
});

export type StorefrontEnv = z.infer<typeof schema>;

const rules = [
  liveRules<StorefrontEnv>({
    nonLocal: ["ORDER_ACCESS_SECRET"],
    secrets: ["STOREFRONT_PREVIEW_SECRET", "STOREFRONT_REVALIDATE_SECRET", "ORDER_ACCESS_SECRET"],
    required: ["TRUSTED_CLIENT_IP_HEADER"],
    databaseUrls: ["DATABASE_STOREFRONT_URL", "DATABASE_CHECKOUT_URL"],
  }),
  (value: StorefrontEnv) =>
    value.STOREVIA_ENV === "production" && value.STOREFRONT_PROTOCOL !== "https"
      ? [{ path: "STOREFRONT_PROTOCOL", message: "must be https in production" }]
      : [],
];

/** Throws a ConfigurationError naming every missing or malformed setting. */
export function verifyConfiguration(): void {
  const { STOREVIA_ENV } = loadEnv("storefront", schema, rules);
  if (STOREVIA_ENV === "development") return;
  // Checkout opens merchants' sealed provider credentials.
  runBootChecks("storefront", { payments: credentialsKeysProblem });
}
