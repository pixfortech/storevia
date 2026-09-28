import "server-only";
import {
  databaseUrlSchema,
  liveRules,
  loadEnv,
  optionalSchema,
  stageSchema,
} from "@storevia/security/env";
import { z } from "zod";

// The marketing site's whole configuration. It holds no auth secret and only
// the marketing database role (ADR-0025). Validated when the server boots
// (instrumentation.ts) and read lazily afterwards.
const schema = z.object({
  STOREVIA_ENV: stageSchema,
  MARKETING_URL: z.url(),
  DASHBOARD_URL: z.url(),
  DATABASE_MARKETING_URL: databaseUrlSchema,
  /** Where contact-form messages are delivered. */
  CONTACT_INBOX: z.email(),
  TRUSTED_CLIENT_IP_HEADER: optionalSchema,
});

export type MarketingEnv = z.infer<typeof schema>;

const rules = [
  liveRules<MarketingEnv>({
    required: ["TRUSTED_CLIENT_IP_HEADER"],
    databaseUrls: ["DATABASE_MARKETING_URL"],
  }),
];

let cached: MarketingEnv | undefined;

export function env(): MarketingEnv {
  cached ??= loadEnv("marketing", schema, rules);
  return cached;
}

/** Entry points into the product (the dashboard owns sign-in and sign-up). */
export const appLinks = () => ({
  signIn: new URL("/sign-in", env().DASHBOARD_URL).toString(),
  signUp: new URL("/sign-up", env().DASHBOARD_URL).toString(),
});
