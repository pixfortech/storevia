import "server-only";
import { Prisma } from "@storevia/database";
import { consumeUsage, releaseUsage } from "@storevia/entitlements";
import {
  isUniqueViolation,
  parseInput,
  recordAudit,
  type StoreContext,
  type TenantContext,
} from "@storevia/tenancy";
import { DomainError, notFound } from "@storevia/types";
import { createProductSchema, updateProductSchema } from "@storevia/validation";
import { HANDLE_MESSAGES, handleProblem, uniqueHandle, slugify } from "./handles";
import { adjustInventoryInTx } from "./inventory";
import {
  conflict,
  inStore,
  internalId,
  lockStoreKey,
  optionalMoneyField,
  parseMoneyField,
  publicId,
  publicIdOrNull,
  storeSettings,
  validationError,
  type TenantTx,
} from "./internal";
import { ensureDefaultLocation } from "./locations";
import type { MoneyJson } from "./money";
import { parseRichText, renderRichTextHtml, RichTextError, type RichTextDoc } from "./rich-text";

// Products (ADR-0027). Products are archived, never deleted; product_limit
// counts non-archived products and is consumed on create and restore, in the
// same transaction, under the usage counter's row lock.

export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

function parseDescription(value: unknown): RichTextDoc | null | undefined {
  if (value === undefined) return undefined;
  try {
    return parseRichText(value);
  } catch (error) {
    if (error instanceof RichTextError) throw validationError("description", error.message);
    throw error;
  }
}

const jsonOrNull = (doc: RichTextDoc | null) =>
  doc === null ? Prisma.DbNull : (doc as unknown as Prisma.InputJsonValue);

/** Handles already used by live products whose handle starts with `base`. */
async function takenHandles(
  tx: TenantTx,
  table: "Product" | "Collection",
  base: string,
  excludeId?: string,
): Promise<Set<string>> {
  const pattern = `${base.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows =
    table === "Product"
      ? await tx.$queryRaw<{ handle: string }[]>`
          SELECT handle FROM "Product" WHERE "deletedAt" IS NULL AND handle LIKE ${pattern}
          ${excludeId ? Prisma.sql`AND id <> ${excludeId}::uuid` : Prisma.empty}`
      : await tx.$queryRaw<{ handle: string }[]>`
          SELECT handle FROM "Collection" WHERE "deletedAt" IS NULL AND handle LIKE ${pattern}
          ${excludeId ? Prisma.sql`AND id <> ${excludeId}::uuid` : Prisma.empty}`;
  return new Set(rows.map((r) => r.handle));
}

/**
 * Resolves the handle to store: an explicit handle must be valid and free (a
 * collision is a validation error, never a silent rename); a generated one
 * gets -2, -3, … Callers hold the store's handle lock.
 */
export async function resolveHandle(
  tx: TenantTx,
  table: "Product" | "Collection",
  explicit: string | null | undefined,
  title: string,
  excludeId?: string,
): Promise<string> {
  if (explicit) {
    const problem = handleProblem(explicit);
    if (problem) throw validationError("handle", HANDLE_MESSAGES[problem]);
    const taken = await takenHandles(tx, table, explicit, excludeId);
    if (taken.has(explicit)) {
      throw validationError(
        "handle",
        `Another ${table === "Product" ? "product" : "collection"} already uses this handle.`,
      );
    }
    return explicit;
  }
  const base = slugify(title) || (table === "Product" ? "product" : "collection");
  return uniqueHandle(
    title,
    await takenHandles(tx, table, base, excludeId),
    table === "Product" ? "product" : "collection",
  );
}

function skuConflict(error: unknown): DomainError | null {
  if (isUniqueViolation(error)) {
    return conflict("Another variant in this store already uses that SKU.", {
      sku: "That SKU is already in use.",
    });
  }
  return null;
}

// --- create --------------------------------------------------------------------

export async function createProduct(
  ctx: TenantContext,
  input: unknown,
): Promise<{ productId: string }> {
  const data = parseInput(createProductSchema, input);
  const description = parseDescription(data.description) ?? null;
  try {
    return await inStore(
      ctx,
      "product.create",
      async (tx, store) => {
        await consumeUsage(tx, store.organisationId, "product_limit");
        await lockStoreKey(tx, store.storeId, "product-handle");
        const handle = await resolveHandle(tx, "Product", data.handle, data.title);
        const { currency } = await storeSettings(tx, store.storeId);
        const price = data.price ? parseMoneyField("price", data.price, currency) : 0n;
        const compareAt =
          optionalMoneyField("compareAtPrice", data.compareAtPrice, currency) ?? null;
        const cost = optionalMoneyField("cost", data.cost, currency) ?? null;
        if (compareAt !== null && compareAt <= price) {
          throw validationError(
            "compareAtPrice",
            "The compare-at price must be higher than the price.",
          );
        }
        const now = new Date();
        const product = await tx.product.create({
          data: {
            organisationId: store.organisationId,
            storeId: store.storeId,
            title: data.title,
            handle,
            status: data.status,
            descriptionDoc: jsonOrNull(description),
            descriptionHtml: renderRichTextHtml(description),
            vendor: data.vendor ?? null,
            productType: data.productType ?? null,
            tags: data.tags ?? [],
            seoTitle: data.seoTitle ?? null,
            seoDescription: data.seoDescription ?? null,
            publishedAt: data.status === "ACTIVE" ? now : null,
            createdById: store.userId,
            updatedById: store.userId,
          },
          select: { id: true },
        });
        const variant = await tx.productVariant.create({
          data: {
            organisationId: store.organisationId,
            storeId: store.storeId,
            productId: product.id,
            title: "Default",
            optionSignature: "",
            sku: data.sku ?? null,
            barcode: data.barcode ?? null,
            currency,
            priceAmount: price,
            compareAtAmount: compareAt,
            costAmount: cost,
            taxable: data.taxable ?? true,
            requiresShipping: data.requiresShipping ?? true,
            weightGrams: data.weightGrams ?? null,
            inventoryPolicy: data.inventoryPolicy ?? "DENY",
          },
          select: { id: true },
        });
        const tracked = data.trackInventory ?? true;
        await tx.inventoryItem.create({
          data: {
            organisationId: store.organisationId,
            storeId: store.storeId,
            variantId: variant.id,
            tracked,
          },
          select: { id: true },
        });
        if (tracked && data.initialStock !== undefined && data.initialStock > 0) {
          const location = await ensureDefaultLocation(tx, store);
          if (!location) throw notFound();
          await adjustInventoryInTx(tx, store, {
            variantId: variant.id,
            locationId: location.id,
            delta: data.initialStock,
            reason: "INITIAL",
            note: null,
          });
        }
        await recordAudit(
          tx,
          store,
          "product.created",
          { type: "Product", id: product.id },
          {
            title: data.title,
            handle,
            status: data.status,
          },
        );
        return { productId: publicId("product", product.id) };
      },
      { write: true },
    );
  } catch (error) {
    throw skuConflict(error) ?? error;
  }
}

// --- update --------------------------------------------------------------------

/** Locks the product row; refuses when someone saved after the editor loaded. */
async function lockProduct(
  tx: TenantTx,
  productId: string,
): Promise<{ id: string; status: ProductStatus; handle: string; title: string; updatedAt: Date }> {
  const rows = await tx.$queryRaw<
    { id: string; status: ProductStatus; handle: string; title: string; updatedAt: Date }[]
  >`SELECT id, status::text AS status, handle, title, "updatedAt" FROM "Product"
    WHERE id = ${productId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

export const STALE_EDIT_MESSAGE =
  "Someone else saved this product while you were editing. Reload to see their changes.";

export async function updateProduct(
  ctx: TenantContext,
  productPublicId: string,
  input: unknown,
): Promise<{ updatedAt: Date }> {
  const productId = internalId("product", productPublicId);
  const data = parseInput(updateProductSchema, input);
  const description = parseDescription(data.description);
  return inStore(
    ctx,
    "product.update",
    async (tx, store) => {
      const current = await lockProduct(tx, productId);
      if (
        data.expectedUpdatedAt &&
        new Date(data.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()
      ) {
        throw conflict(STALE_EDIT_MESSAGE);
      }
      const changes: Prisma.ProductUpdateInput = { updatedBy: { connect: { id: store.userId } } };
      const fields: string[] = [];
      if (data.title !== undefined && data.title !== current.title) {
        changes.title = data.title;
        fields.push("title");
      }
      let handle = current.handle;
      if (data.handle !== undefined && data.handle !== null && data.handle !== current.handle) {
        await lockStoreKey(tx, store.storeId, "product-handle");
        handle = await resolveHandle(
          tx,
          "Product",
          data.handle,
          data.title ?? current.title,
          productId,
        );
        changes.handle = handle;
        fields.push("handle");
      }
      if (description !== undefined) {
        changes.descriptionDoc = jsonOrNull(description);
        changes.descriptionHtml = renderRichTextHtml(description);
        fields.push("description");
      }
      for (const key of ["vendor", "productType", "seoTitle", "seoDescription"] as const) {
        if (data[key] !== undefined) {
          changes[key] = data[key];
          fields.push(key);
        }
      }
      if (data.tags !== undefined) {
        changes.tags = data.tags;
        fields.push("tags");
      }
      if (data.taxable !== undefined) {
        await tx.productVariant.updateMany({
          where: { productId, deletedAt: null },
          data: { taxable: data.taxable },
        });
        fields.push("taxable");
      }
      const updated = await tx.product.update({
        where: { id: productId },
        data: changes,
        select: { updatedAt: true },
      });
      await recordAudit(
        tx,
        store,
        "product.updated",
        { type: "Product", id: productId },
        {
          fields: fields.join(","),
          ...(handle !== current.handle ? { handle, previousHandle: current.handle } : {}),
        },
      );
      return { updatedAt: updated.updatedAt };
    },
    { write: true },
  );
}

// --- status ----------------------------------------------------------------------

async function changeStatus(
  tx: TenantTx,
  store: StoreContext,
  productId: string,
  target: ProductStatus,
): Promise<{ changed: boolean; updatedAt: Date }> {
  const current = await lockProduct(tx, productId);
  if (current.status === target) return { changed: false, updatedAt: current.updatedAt };
  const now = new Date();
  if (current.status === "ARCHIVED") {
    // Restoring counts against the plan again (ADR-0027 §7).
    await consumeUsage(tx, store.organisationId, "product_limit");
  }
  if (target === "ARCHIVED") {
    await releaseUsage(tx, store.organisationId, "product_limit");
  }
  const { updatedAt } = await tx.product.update({
    where: { id: productId },
    data: {
      status: target,
      archivedAt: target === "ARCHIVED" ? now : null,
      ...(target === "ACTIVE" ? { publishedAt: now } : {}),
      updatedBy: { connect: { id: store.userId } },
    },
    select: { updatedAt: true },
  });
  const action =
    target === "ARCHIVED"
      ? "product.archived"
      : current.status === "ARCHIVED"
        ? "product.restored"
        : target === "ACTIVE"
          ? "product.activated"
          : "product.drafted";
  await recordAudit(
    tx,
    store,
    action,
    { type: "Product", id: productId },
    {
      status: target,
      previousStatus: current.status,
      title: current.title,
    },
  );
  return { changed: true, updatedAt };
}

/** Makes a draft visible (ACTIVE) or hides it again (DRAFT). Usage is unchanged. */
export async function setProductStatus(
  ctx: TenantContext,
  productPublicId: string,
  /** "ACTIVE" or "DRAFT". Typed loosely because callers (server actions) pass what the browser sent. */
  status: unknown,
): Promise<{ updatedAt: Date }> {
  const productId = internalId("product", productPublicId);
  // The type isn't a runtime check: a replayed action can send any string,
  // and "ARCHIVED" here would archive without product.archive.
  if (status !== "ACTIVE" && status !== "DRAFT") {
    throw validationError("status", "Choose active or draft.");
  }
  return inStore(
    ctx,
    "product.update",
    async (tx, store) => {
      const current = await lockProduct(tx, productId);
      if (current.status === "ARCHIVED") {
        throw conflict("Restore this product before changing its status.");
      }
      const { updatedAt } = await changeStatus(tx, store, productId, status);
      return { updatedAt };
    },
    { write: true },
  );
}

/** Archives a product: hidden, restorable, and no longer counted against the plan. */
export async function archiveProduct(ctx: TenantContext, productPublicId: string): Promise<void> {
  const productId = internalId("product", productPublicId);
  await inStore(
    ctx,
    "product.archive",
    (tx, store) => changeStatus(tx, store, productId, "ARCHIVED"),
    {
      write: true,
    },
  );
}

/**
 * Restores an archived product as a draft. Counts against the plan
 * (LIMIT_REACHED when full). A product that isn't archived is left as it is:
 * restoring from a stale list must never unpublish a live product.
 */
export async function restoreProduct(ctx: TenantContext, productPublicId: string): Promise<void> {
  const productId = internalId("product", productPublicId);
  await inStore(
    ctx,
    "product.archive",
    async (tx, store) => {
      const current = await lockProduct(tx, productId);
      if (current.status !== "ARCHIVED") return;
      await changeStatus(tx, store, productId, "DRAFT");
    },
    {
      write: true,
    },
  );
}

// --- bulk --------------------------------------------------------------------------

export interface BulkResult {
  readonly succeeded: readonly string[];
  readonly failed: readonly { readonly id: string; readonly message: string }[];
}

/**
 * Runs `fn` once per product, each in its own transaction, so one failure
 * (a product at the plan limit, one already gone) doesn't undo the others.
 * Ids are resolved inside this store's RLS scope: another store's product is
 * simply "not found".
 */
export async function forEachProduct(
  ids: readonly string[],
  fn: (productId: string) => Promise<unknown>,
): Promise<BulkResult> {
  const succeeded: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      await fn(id);
      succeeded.push(id);
    } catch (error) {
      if (error instanceof DomainError) {
        failed.push({ id, message: error.code === "NOT_FOUND" ? "Not found." : error.message });
      } else {
        throw error;
      }
    }
  }
  return { succeeded, failed };
}

// --- read model for the editor ----------------------------------------------------

export interface VariantView {
  readonly id: string;
  readonly title: string;
  readonly position: number;
  /** optionId → valueId (public ids). */
  readonly optionValues: Readonly<Record<string, string>>;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly price: MoneyJson;
  readonly compareAtPrice: MoneyJson | null;
  readonly cost: MoneyJson | null;
  readonly taxable: boolean;
  readonly requiresShipping: boolean;
  readonly weightGrams: number | null;
  readonly inventoryPolicy: "DENY" | "CONTINUE";
  readonly tracked: boolean;
  /** Available across active locations. */
  readonly available: number;
  readonly imageMediaId: string | null;
  readonly hasInventoryHistory: boolean;
}

export interface ProductMediaView {
  readonly mediaId: string;
  readonly position: number;
  readonly altText: string | null;
  readonly filename: string;
  readonly mimeType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly storageKey: string;
  readonly renditions: readonly MediaRendition[];
}

export interface MediaRendition {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly bytes?: number;
}

export interface ProductDetails {
  readonly id: string;
  readonly title: string;
  readonly handle: string;
  readonly status: ProductStatus;
  readonly description: RichTextDoc | null;
  readonly vendor: string | null;
  readonly productType: string | null;
  readonly tags: readonly string[];
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly publishedAt: Date | null;
  readonly options: readonly {
    readonly id: string;
    readonly name: string;
    readonly position: number;
    readonly values: readonly {
      readonly id: string;
      readonly value: string;
      readonly position: number;
    }[];
  }[];
  readonly variants: readonly VariantView[];
  readonly media: readonly ProductMediaView[];
  readonly collections: readonly { readonly id: string; readonly title: string }[];
}

export function parseRenditions(value: unknown): MediaRendition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r: unknown) => {
    if (typeof r !== "object" || r === null) return [];
    const { key, width, height, format, bytes } = r as Record<string, unknown>;
    return typeof key === "string" &&
      typeof width === "number" &&
      typeof height === "number" &&
      typeof format === "string"
      ? [{ key, width, height, format, ...(typeof bytes === "number" ? { bytes } : {}) }]
      : [];
  });
}

const money = (amount: bigint, currency: string): MoneyJson => ({
  amount: amount.toString(),
  currency,
});

export async function getProduct(
  ctx: TenantContext,
  productPublicId: string,
): Promise<ProductDetails> {
  const productId = internalId("product", productPublicId);
  return inStore(ctx, "product.read", async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        id: true,
        title: true,
        handle: true,
        status: true,
        descriptionDoc: true,
        vendor: true,
        productType: true,
        tags: true,
        seoTitle: true,
        seoDescription: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
        publishedAt: true,
        store: { select: { currency: true } },
        options: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            name: true,
            position: true,
            values: {
              orderBy: { position: "asc" },
              select: { id: true, value: true, position: true },
            },
          },
        },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            position: true,
            sku: true,
            barcode: true,
            currency: true,
            priceAmount: true,
            compareAtAmount: true,
            costAmount: true,
            taxable: true,
            requiresShipping: true,
            weightGrams: true,
            inventoryPolicy: true,
            imageMediaId: true,
            optionValues: { select: { optionId: true, optionValueId: true } },
            inventoryItem: {
              select: {
                tracked: true,
                levels: {
                  where: { location: { isActive: true, deletedAt: null } },
                  select: { available: true },
                },
                movements: { take: 1, select: { id: true } },
              },
            },
          },
        },
        media: {
          orderBy: { position: "asc" },
          where: { mediaAsset: { deletedAt: null } },
          select: {
            position: true,
            altText: true,
            mediaAsset: {
              select: {
                id: true,
                filename: true,
                mimeType: true,
                width: true,
                height: true,
                altText: true,
                storageKey: true,
                renditions: true,
              },
            },
          },
        },
        collections: {
          where: { collection: { deletedAt: null } },
          select: { collection: { select: { id: true, title: true } } },
          orderBy: { collection: { title: "asc" } },
        },
      },
    });
    if (!product) throw notFound();
    let description: RichTextDoc | null = null;
    try {
      description = parseRichText(product.descriptionDoc);
    } catch {
      // Stored documents were validated on write; a bad one reads as empty.
    }
    return {
      id: publicId("product", product.id),
      title: product.title,
      handle: product.handle,
      status: product.status,
      description,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      currency: product.store.currency,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      archivedAt: product.archivedAt,
      publishedAt: product.publishedAt,
      options: product.options.map((o) => ({
        id: publicId("option", o.id),
        name: o.name,
        position: o.position,
        values: o.values.map((v) => ({
          id: publicId("optionValue", v.id),
          value: v.value,
          position: v.position,
        })),
      })),
      variants: product.variants.map((v) => ({
        id: publicId("variant", v.id),
        title: v.title,
        position: v.position,
        optionValues: Object.fromEntries(
          v.optionValues.map((ov) => [
            publicId("option", ov.optionId),
            publicId("optionValue", ov.optionValueId),
          ]),
        ),
        sku: v.sku,
        barcode: v.barcode,
        price: money(v.priceAmount, v.currency),
        compareAtPrice: v.compareAtAmount === null ? null : money(v.compareAtAmount, v.currency),
        cost: v.costAmount === null ? null : money(v.costAmount, v.currency),
        taxable: v.taxable,
        requiresShipping: v.requiresShipping,
        weightGrams: v.weightGrams,
        inventoryPolicy: v.inventoryPolicy,
        tracked: v.inventoryItem?.tracked ?? false,
        available: (v.inventoryItem?.levels ?? []).reduce((n, l) => n + l.available, 0),
        imageMediaId: publicIdOrNull("media", v.imageMediaId),
        hasInventoryHistory: (v.inventoryItem?.movements.length ?? 0) > 0,
      })),
      media: product.media.map((m) => ({
        mediaId: publicId("media", m.mediaAsset.id),
        position: m.position,
        altText: m.altText ?? m.mediaAsset.altText,
        filename: m.mediaAsset.filename,
        mimeType: m.mediaAsset.mimeType,
        width: m.mediaAsset.width,
        height: m.mediaAsset.height,
        storageKey: m.mediaAsset.storageKey,
        renditions: parseRenditions(m.mediaAsset.renditions),
      })),
      collections: product.collections.map((c) => ({
        id: publicId("collection", c.collection.id),
        title: c.collection.title,
      })),
    };
  });
}
