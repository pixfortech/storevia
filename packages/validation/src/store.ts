import { z } from "zod";
import {
  countrySchema,
  currencySchema,
  displayNameSchema,
  emailSchema,
  localeSchema,
  timezoneSchema,
} from "./common";

/**
 * Store slugs become `{slug}.storevia.site`. Lower-case letters, digits and
 * single hyphens, 3-40 characters, no leading/trailing hyphen (mirrors the
 * Store_slug_format CHECK constraint).
 */
export const STORE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Slugs that could impersonate Storevia or collide with infrastructure. */
export const RESERVED_STORE_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "apps",
  "assets",
  "auth",
  "billing",
  "blog",
  "cdn",
  "checkout",
  "dashboard",
  "dev",
  "docs",
  "email",
  "help",
  "internal",
  "login",
  "logout",
  "mail",
  "media",
  "my",
  "news",
  "official",
  "pay",
  "payments",
  "platform",
  "root",
  "security",
  "shop",
  "shops",
  "signin",
  "signup",
  "staff",
  "staging",
  "static",
  "status",
  "store",
  "stores",
  "storevia",
  "support",
  "system",
  "team",
  "test",
  "www",
]);

export function normaliseSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(STORE_SLUG_RE, "Use 3-40 lower-case letters, numbers and hyphens.")
  .refine((slug) => !slug.includes("--"), "Don't use two hyphens in a row.")
  .refine((slug) => !RESERVED_STORE_SLUGS.has(slug), "That address is reserved.")
  .refine((slug) => !slug.includes("storevia"), "That address is reserved.");

export const createStoreSchema = z.object({
  name: displayNameSchema("store"),
  slug: storeSlugSchema,
  currency: currencySchema,
  country: countrySchema,
  locale: localeSchema,
  timezone: timezoneSchema,
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = z.object({
  name: displayNameSchema("store"),
  locale: localeSchema,
  timezone: timezoneSchema,
  contactEmail: z.union([z.literal(""), emailSchema]).transform((v) => v || null),
  supportEmail: z.union([z.literal(""), emailSchema]).transform((v) => v || null),
});
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
