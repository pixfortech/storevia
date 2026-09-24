import "server-only";
import { z } from "zod";

// The marketing site's whole configuration. It holds no auth secret and only
// the marketing database role (ADR-0025).
const schema = z
  .object({
    STOREVIA_ENV: z
      .enum(["development", "test", "preview", "staging", "production"])
      .default("development"),
    MARKETING_URL: z.url(),
    DASHBOARD_URL: z.url(),
    DATABASE_MARKETING_URL: z.string().min(1),
    /** Where contact-form messages are delivered. */
    CONTACT_INBOX: z.email(),
    TRUSTED_CLIENT_IP_HEADER: z
      .string()
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
  })
  .refine(
    (value) =>
      !["staging", "production"].includes(value.STOREVIA_ENV) ||
      Boolean(value.TRUSTED_CLIENT_IP_HEADER),
    {
      path: ["TRUSTED_CLIENT_IP_HEADER"],
      message: "required in staging and production (e.g. cf-connecting-ip)",
    },
  );

export type MarketingEnv = z.infer<typeof schema>;

let cached: MarketingEnv | undefined;

export function env(): MarketingEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid marketing configuration: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** Entry points into the product (the dashboard owns sign-in and sign-up). */
export const appLinks = () => ({
  signIn: new URL("/sign-in", env().DASHBOARD_URL).toString(),
  signUp: new URL("/sign-up", env().DASHBOARD_URL).toString(),
});
