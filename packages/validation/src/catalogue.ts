import { z } from "zod";

// Catalogue input shapes (ADR-0027). Shared by the dashboard forms and the
// commerce services; the services re-validate everything, parse money with
// the store's currency, check rich text against its allow-list and resolve
// public ids against the tenant, so nothing here is trusted on its own.

const cleanText = (value: string) => value.trim().replace(/\s+/g, " ");

const requiredText = (label: string, max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(1, `Enter a ${label}.`)
        .max(max, `Use at most ${String(max)} characters.`),
    );

/** Optional text: "" and whitespace become null. */
const optionalText = (max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(max, `Use at most ${String(max)} characters.`))
    .transform((value) => (value === "" ? null : value))
    .nullish();

/** A public id (TypeID); resolved against the tenant by the service. */
export const publicIdSchema = z.string().trim().min(1).max(64);

/**
 * Money as typed ("999.50"). The service parses it with the store currency's
 * exponent; floats never touch it. "" means "not set" for optional amounts.
 */
const moneyText = z.string().trim().max(32, "Enter a smaller amount.");
const optionalMoneyText = moneyText.transform((value) => (value === "" ? null : value)).nullish();

const skuSchema = z
  .string()
  .trim()
  .max(255, "Use at most 255 characters.")
  .transform((value) => (value === "" ? null : value))
  .nullish();

const barcodeSchema = z
  .string()
  .trim()
  .max(64, "Use at most 64 characters.")
  .regex(/^[\x21-\x7e]*$/, "Use letters, numbers and symbols without spaces.")
  .transform((value) => (value === "" ? null : value))
  .nullish();

export const PRODUCT_TAG_LIMIT = 250;

/** Tags from a list or a comma-separated string; trimmed, de-duplicated (case-insensitive). */
export const tagsSchema = z
  .union([z.array(z.string()), z.string()])
  .transform((value) => (typeof value === "string" ? value.split(",") : value))
  .transform((tags) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of tags) {
      const tag = cleanText(raw).slice(0, 255);
      const key = tag.toLocaleLowerCase("en");
      if (tag && !seen.has(key)) {
        seen.add(key);
        out.push(tag);
      }
    }
    return out;
  })
  .pipe(
    z.array(z.string()).max(PRODUCT_TAG_LIMIT, `Use at most ${String(PRODUCT_TAG_LIMIT)} tags.`),
  );

const handleInput = z
  .string()
  .trim()
  .toLowerCase()
  .max(100, "Use at most 100 characters.")
  .transform((value) => (value === "" ? null : value))
  .nullish();

const weightSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (value === "" ? null : Number(value)))
  .pipe(
    z
      .number("Enter a weight in grams.")
      .int("Enter whole grams.")
      .min(0, "The weight can't be negative.")
      .max(1_000_000, "Enter a smaller weight.")
      .nullable(),
  )
  .nullish();

const quantitySchema = (min: number, max: number) =>
  z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === "string" ? Number(value.trim() || "NaN") : value))
    .pipe(
      z
        .number("Enter a whole number.")
        .int("Enter a whole number.")
        .min(min, `Enter at least ${String(min)}.`)
        .max(max, `Enter at most ${String(max)}.`),
    );

export const inventoryPolicySchema = z.enum(["DENY", "CONTINUE"]);

/** Fields of a product's single variant, edited inline for products without options. */
const variantFields = {
  price: moneyText.optional(),
  compareAtPrice: optionalMoneyText,
  cost: optionalMoneyText,
  sku: skuSchema,
  barcode: barcodeSchema,
  taxable: z.boolean().optional(),
  requiresShipping: z.boolean().optional(),
  weightGrams: weightSchema,
  inventoryPolicy: inventoryPolicySchema.optional(),
  trackInventory: z.boolean().optional(),
};

const productFields = {
  title: requiredText("product title", 255),
  handle: handleInput,
  /** Tiptap JSON (object or string); validated by the commerce rich-text allow-list. */
  description: z.unknown().optional(),
  vendor: optionalText(255),
  productType: optionalText(255),
  tags: tagsSchema.optional(),
  seoTitle: optionalText(255),
  seoDescription: optionalText(1000),
  taxable: z.boolean().optional(),
};

export const createProductSchema = z.object({
  ...productFields,
  ...variantFields,
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
  /** Stock at the store's default location for a simple product. */
  initialStock: quantitySchema(0, 1_000_000).optional(),
});
export type CreateProductInput = z.input<typeof createProductSchema>;

export const updateProductSchema = z.object({
  ...productFields,
  title: productFields.title.optional(),
  tags: tagsSchema.optional(),
  /** The updatedAt the editor loaded; a newer row means someone else saved first. */
  expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
});
export type UpdateProductInput = z.input<typeof updateProductSchema>;

export const updateVariantSchema = z.object({
  variantId: publicIdSchema,
  ...variantFields,
  /** Media id, or null to clear. */
  imageMediaId: publicIdSchema.nullish(),
});
export type UpdateVariantInput = z.input<typeof updateVariantSchema>;

export const VARIANT_BULK_LIMIT = 100;
export const updateVariantsSchema = z.object({
  variants: z
    .array(updateVariantSchema)
    .min(1, "Nothing to save.")
    .max(VARIANT_BULK_LIMIT, `Save at most ${String(VARIANT_BULK_LIMIT)} variants at once.`),
});

export const productOptionsSchema = z.object({
  options: z
    .array(
      z.object({
        id: publicIdSchema.optional(),
        name: z.string().max(255),
        values: z
          .array(z.object({ id: publicIdSchema.optional(), value: z.string().max(255) }))
          .max(50, "An option can have at most 50 values."),
      }),
    )
    .max(3, "A product can have at most 3 options."),
  /** Variants the merchant confirmed may be removed; must match the plan exactly. */
  confirmRemoveVariantIds: z.array(publicIdSchema).max(100).optional(),
});
export type ProductOptionsInput = z.input<typeof productOptionsSchema>;

export const productMediaOrderSchema = z.object({
  mediaIds: z.array(publicIdSchema).max(250, "A product can have at most 250 media."),
});

export const PRODUCT_SORTS = ["updated", "created", "title_asc", "title_desc"] as const;
export const STOCK_FILTERS = ["in_stock", "low_stock", "out_of_stock", "untracked"] as const;

export const productListQuerySchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional().catch(undefined),
  vendor: z.string().trim().max(255).optional().catch(undefined),
  productType: z.string().trim().max(255).optional().catch(undefined),
  collectionId: publicIdSchema.optional().catch(undefined),
  stock: z.enum(STOCK_FILTERS).optional().catch(undefined),
  sort: z.enum(PRODUCT_SORTS).default("updated").catch("updated"),
  cursor: z.string().max(500).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).default(25).catch(25),
});
export type ProductListQuery = z.input<typeof productListQuerySchema>;

export const BULK_PRODUCT_LIMIT = 100;
export const bulkProductActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["activate", "draft", "archive", "restore"]),
    productIds: z.array(publicIdSchema).min(1).max(BULK_PRODUCT_LIMIT),
  }),
  z.object({
    action: z.literal("addToCollection"),
    productIds: z.array(publicIdSchema).min(1).max(BULK_PRODUCT_LIMIT),
    collectionId: publicIdSchema,
  }),
  z.object({
    action: z.enum(["addTags", "removeTags"]),
    productIds: z.array(publicIdSchema).min(1).max(BULK_PRODUCT_LIMIT),
    tags: tagsSchema.pipe(z.array(z.string()).min(1, "Enter at least one tag.")),
  }),
]);
export type BulkProductActionInput = z.input<typeof bulkProductActionSchema>;

export const collectionSchema = z.object({
  title: requiredText("collection title", 255),
  handle: handleInput,
  description: z.unknown().optional(),
  seoTitle: optionalText(255),
  seoDescription: optionalText(1000),
  imageMediaId: publicIdSchema.nullish(),
  sortOrder: z
    .enum(["MANUAL", "TITLE_ASC", "TITLE_DESC", "PRICE_ASC", "PRICE_DESC", "CREATED_DESC"])
    .optional(),
});
export type CollectionInput = z.input<typeof collectionSchema>;

export const collectionProductsSchema = z.object({
  productIds: z.array(publicIdSchema).max(BULK_PRODUCT_LIMIT),
});

export const LOCATION_CODE_RE = /^[A-Z0-9](?:[A-Z0-9-]{0,18}[A-Z0-9])?$/;

export const locationSchema = z.object({
  name: requiredText("location name", 100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(LOCATION_CODE_RE, "Use 1-20 capital letters, numbers or hyphens."),
  addressLine1: optionalText(255),
  addressLine2: optionalText(255),
  city: optionalText(120),
  region: optionalText(120),
  postalCode: optionalText(20),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a country."),
  phone: optionalText(40),
  fulfilsOnlineOrders: z.boolean().default(true),
});
export type LocationInput = z.input<typeof locationSchema>;

/** Movement reasons a person may record by hand in M3 (ADR-0027 §8). */
export const MANUAL_ADJUSTMENT_REASONS = ["RESTOCK", "MANUAL_ADJUSTMENT", "CORRECTION"] as const;

export const INVENTORY_QUANTITY_LIMIT = 1_000_000;

const noteSchema = z
  .string()
  .trim()
  .max(500, "Use at most 500 characters.")
  .transform((value) => (value === "" ? null : value))
  .nullish();

export const adjustInventorySchema = z.object({
  variantId: publicIdSchema,
  /** Omitted: the store's default location, created on first use (ADR-0027 §8). */
  locationId: publicIdSchema.optional(),
  delta: quantitySchema(-INVENTORY_QUANTITY_LIMIT, INVENTORY_QUANTITY_LIMIT).refine(
    (value) => value !== 0,
    "Enter a change other than 0.",
  ),
  reason: z.enum(MANUAL_ADJUSTMENT_REASONS),
  note: noteSchema,
});
export type AdjustInventoryInput = z.input<typeof adjustInventorySchema>;

export const setInventorySchema = z.object({
  variantId: publicIdSchema,
  /** Omitted: the store's default location, created on first use (ADR-0027 §8). */
  locationId: publicIdSchema.optional(),
  quantity: quantitySchema(-INVENTORY_QUANTITY_LIMIT, INVENTORY_QUANTITY_LIMIT),
  reason: z.enum(MANUAL_ADJUSTMENT_REASONS).default("CORRECTION"),
  note: noteSchema,
});
export type SetInventoryInput = z.input<typeof setInventorySchema>;

export const moveInventorySchema = z
  .object({
    variantId: publicIdSchema,
    fromLocationId: publicIdSchema,
    toLocationId: publicIdSchema,
    quantity: quantitySchema(1, INVENTORY_QUANTITY_LIMIT),
    note: noteSchema,
  })
  .refine((value) => value.fromLocationId !== value.toLocationId, {
    message: "Choose two different locations.",
    path: ["toLocationId"],
  });
export type MoveInventoryInput = z.input<typeof moveInventorySchema>;
