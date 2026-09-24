import "server-only";
import { z } from "zod";

// Fail fast on missing or malformed configuration (docs 02 §5).
const schema = z
  .object({
    STOREVIA_ENV: z
      .enum(["development", "test", "preview", "staging", "production"])
      .default("development"),
    PLATFORM_ADMIN_URL: z.url(),
    AUTH_PLATFORM_SECRET: z.string().min(32, "AUTH_PLATFORM_SECRET must be at least 32 characters"),
    DATABASE_SYSTEM_URL: z.string().min(1),
    DATABASE_PLATFORM_URL: z.string().min(1),
    TRUSTED_CLIENT_IP_HEADER: z
      .string()
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
  })
  .refine(
    (value) =>
      !["staging", "production"].includes(value.STOREVIA_ENV) ||
      Boolean(value.TRUSTED_CLIENT_IP_HEADER),
    { path: ["TRUSTED_CLIENT_IP_HEADER"], message: "required in staging and production" },
  );

export type PlatformAdminEnv = z.infer<typeof schema>;

let cached: PlatformAdminEnv | undefined;

export function env(): PlatformAdminEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid platform-admin configuration: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
