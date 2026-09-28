import "server-only";
import {
  databaseUrlSchema,
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
  PLATFORM_ADMIN_URL: z.url(),
  AUTH_PLATFORM_SECRET: secretSchema(),
  DATABASE_SYSTEM_URL: databaseUrlSchema,
  DATABASE_PLATFORM_URL: databaseUrlSchema,
  TRUSTED_CLIENT_IP_HEADER: optionalSchema,
  // Seals staff TOTP secrets (ADR-0035): "1:<base64 32 bytes>[,2:…]".
  STAFF_MFA_KEYS: z
    .string()
    .regex(
      /^\d{1,4}:[A-Za-z0-9+/=_-]{43,44}(,\d{1,4}:[A-Za-z0-9+/=_-]{43,44})*$/,
      'must be "1:<base64 32 bytes>", comma-separated for rotation',
    )
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type PlatformAdminEnv = z.infer<typeof schema>;

const rules = [
  liveRules<PlatformAdminEnv>({
    nonLocal: ["STAFF_MFA_KEYS"],
    secrets: ["AUTH_PLATFORM_SECRET"],
    required: ["TRUSTED_CLIENT_IP_HEADER"],
    databaseUrls: ["DATABASE_SYSTEM_URL", "DATABASE_PLATFORM_URL"],
  }),
];

let cached: PlatformAdminEnv | undefined;

export function env(): PlatformAdminEnv {
  cached ??= loadEnv("platform-admin", schema, rules);
  return cached;
}
