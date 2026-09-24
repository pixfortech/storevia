import "server-only";
import { z } from "zod";

// Fail fast on missing or malformed configuration (docs 02 §5).
const schema = z
  .object({
    STOREVIA_ENV: z
      .enum(["development", "test", "preview", "staging", "production"])
      .default("development"),
    DASHBOARD_URL: z.url(),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    DATABASE_URL: z.string().min(1),
    DATABASE_SYSTEM_URL: z.string().min(1),
    STOREFRONT_ROOT_DOMAIN: z.string().min(1).default("storevia.site"),
    TRUSTED_CLIENT_IP_HEADER: z
      .string()
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
  })
  .refine(
    // Without it every client shares one unknown IP and per-IP limits are off.
    (value) =>
      !["staging", "production"].includes(value.STOREVIA_ENV) ||
      Boolean(value.TRUSTED_CLIENT_IP_HEADER),
    {
      path: ["TRUSTED_CLIENT_IP_HEADER"],
      message: "required in staging and production (e.g. cf-connecting-ip)",
    },
  );

export type DashboardEnv = z.infer<typeof schema>;

let cached: DashboardEnv | undefined;

export function env(): DashboardEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid dashboard configuration: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export const isDevelopment = () => process.env.NODE_ENV !== "production";
