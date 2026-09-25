import "server-only";
import {
  isUniqueViolation,
  parseInput,
  recordAudit,
  type StoreContext,
  type TenantContext,
} from "@storevia/tenancy";
import { DomainError, notFound } from "@storevia/types";
import { productOptionsSchema, updateVariantsSchema } from "@storevia/validation";
import {
  conflict,
  inStore,
  internalId,
  optionalMoneyField,
  parseMoneyField,
  publicId,
  validationError,
  type TenantTx,
} from "./internal";
import type { MoneyJson } from "./money";
import {
  OptionPlanError,
  optionSignature,
  planOptionChange,
  variantTitle,
  type CurrentOption,
  type CurrentVariant,
  type DesiredOption,
  type OptionPlan,
} from "./variants";

// Option edits and the variant matrix (ADR-0027 §5). Nothing that holds data
// (SKU, barcode, price, stock, image) is discarded without the merchant
// confirming exactly which variants go.

export interface VariantRemoval {
  readonly variantId: string;
  readonly title: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly price: MoneyJson;
  readonly available: number;
  readonly hasImage: boolean;
  /** Variants with stock history are kept in the ledger (soft-deleted), not erased. */
  readonly hasInventoryHistory: boolean;
}

export type OptionChangeResult =
  | {
      readonly status: "confirmation_required";
      readonly removals: readonly VariantRemoval[];
      readonly createCount: number;
    }
  | {
      readonly status: "applied";
      readonly created: number;
      readonly removed: number;
      readonly updatedAt: Date;
    };

interface LoadedProduct {
  readonly options: CurrentOption[];
  readonly variants: (CurrentVariant & {
    readonly title: string;
    readonly sku: string | null;
    readonly barcode: string | null;
    readonly priceAmount: bigint;
    readonly compareAtAmount: bigint | null;
    readonly costAmount: bigint | null;
    readonly currency: string;
    readonly taxable: boolean;
    readonly requiresShipping: boolean;
    readonly weightGrams: number | null;
    readonly inventoryPolicy: "DENY" | "CONTINUE";
    readonly imageMediaId: string | null;
    readonly tracked: boolean;
    readonly available: number;
    readonly itemId: string | null;
    readonly hasHistory: boolean;
  })[];
}

async function lockProductRow(tx: TenantTx, productId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Product" WHERE id = ${productId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  if (rows.length === 0) throw notFound();
}

async function loadProduct(tx: TenantTx, productId: string): Promise<LoadedProduct> {
  const options = await tx.productOption.findMany({
    where: { productId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      values: { orderBy: { position: "asc" }, select: { id: true, value: true } },
    },
  });
  const variants = await tx.productVariant.findMany({
    where: { productId, deletedAt: null },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      sku: true,
      barcode: true,
      priceAmount: true,
      compareAtAmount: true,
      costAmount: true,
      currency: true,
      taxable: true,
      requiresShipping: true,
      weightGrams: true,
      inventoryPolicy: true,
      imageMediaId: true,
      optionValues: { select: { optionId: true, optionValueId: true } },
      inventoryItem: {
        select: {
          id: true,
          tracked: true,
          levels: {
            where: { location: { isActive: true, deletedAt: null } },
            select: { available: true },
          },
          movements: { take: 1, select: { id: true } },
        },
      },
    },
  });
  return {
    options,
    variants: variants.map((v) => ({
      id: v.id,
      values: Object.fromEntries(v.optionValues.map((ov) => [ov.optionId, ov.optionValueId])),
      title: v.title,
      sku: v.sku,
      barcode: v.barcode,
      priceAmount: v.priceAmount,
      compareAtAmount: v.compareAtAmount,
      costAmount: v.costAmount,
      currency: v.currency,
      taxable: v.taxable,
      requiresShipping: v.requiresShipping,
      weightGrams: v.weightGrams,
      inventoryPolicy: v.inventoryPolicy,
      imageMediaId: v.imageMediaId,
      tracked: v.inventoryItem?.tracked ?? true,
      available: (v.inventoryItem?.levels ?? []).reduce((n, l) => n + l.available, 0),
      itemId: v.inventoryItem?.id ?? null,
      hasHistory: (v.inventoryItem?.movements.length ?? 0) > 0,
    })),
  };
}

function toDesired(input: ReturnType<typeof parseOptions>["options"]): DesiredOption[] {
  return input.map((option) => ({
    id: option.id === undefined ? undefined : internalId("option", option.id),
    name: option.name,
    values: option.values.map((value) => ({
      id: value.id === undefined ? undefined : internalId("optionValue", value.id),
      value: value.value,
    })),
  }));
}

function parseOptions(input: unknown) {
  return parseInput(productOptionsSchema, input);
}

function plan(loaded: LoadedProduct, desired: DesiredOption[]): OptionPlan {
  try {
    return planOptionChange(loaded.options, loaded.variants, desired);
  } catch (error) {
    if (error instanceof OptionPlanError) throw validationError(error.field, error.message);
    throw error;
  }
}

function removals(loaded: LoadedProduct, ids: readonly string[]): VariantRemoval[] {
  const byId = new Map(loaded.variants.map((v) => [v.id, v]));
  return ids.flatMap((id) => {
    const v = byId.get(id);
    return v
      ? [
          {
            variantId: publicId("variant", v.id),
            title: v.title,
            sku: v.sku,
            barcode: v.barcode,
            price: { amount: v.priceAmount.toString(), currency: v.currency },
            available: v.available,
            hasImage: v.imageMediaId !== null,
            hasInventoryHistory: v.hasHistory,
          },
        ]
      : [];
  });
}

/**
 * Applies an option edit. When the edit would remove variants, nothing is
 * applied until `confirmRemoveVariantIds` lists exactly those variants; the
 * result then says which variants (and what they hold) would go.
 */
export async function changeProductOptions(
  ctx: TenantContext,
  productPublicId: string,
  input: unknown,
): Promise<OptionChangeResult> {
  const productId = internalId("product", productPublicId);
  const data = parseOptions(input);
  const desired = toDesired(data.options);
  const confirmed = new Set(
    (data.confirmRemoveVariantIds ?? []).map((id) => internalId("variant", id)),
  );
  try {
    return await inStore(
      ctx,
      "product.update",
      async (tx, store) => {
        await lockProductRow(tx, productId);
        const loaded = await loadProduct(tx, productId);
        const planned = plan(loaded, desired);
        const needsConfirmation =
          planned.remove.length > 0 &&
          (planned.remove.length !== confirmed.size ||
            planned.remove.some((id) => !confirmed.has(id)));
        if (needsConfirmation) {
          return {
            status: "confirmation_required" as const,
            removals: removals(loaded, planned.remove),
            createCount: planned.create.length,
          };
        }
        const applied = await applyPlan(tx, store, productId, loaded, planned);
        const updated = await tx.product.update({
          where: { id: productId },
          data: { updatedBy: { connect: { id: store.userId } } },
          select: { updatedAt: true },
        });
        await recordAudit(
          tx,
          store,
          "product.options_changed",
          { type: "Product", id: productId },
          {
            count: planned.options.length,
            createdVariants: planned.create.length,
            removedVariants: applied.softDeleted,
            deletedVariants: applied.hardDeleted,
          },
        );
        return {
          status: "applied" as const,
          created: planned.create.length,
          removed: planned.remove.length,
          updatedAt: updated.updatedAt,
        };
      },
      { write: true, timeoutMs: 20_000 },
    );
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (isUniqueViolation(error)) {
      throw conflict("The product changed while you were editing. Reload and try again.");
    }
    throw error;
  }
}

async function applyPlan(
  tx: TenantTx,
  store: StoreContext,
  productId: string,
  loaded: LoadedProduct,
  planned: OptionPlan,
): Promise<{ softDeleted: number; hardDeleted: number }> {
  const byId = new Map(loaded.variants.map((v) => [v.id, v]));
  let softDeleted = 0;
  let hardDeleted = 0;

  // 1. Removed variants: erase when they have no stock history; otherwise
  //    soft-delete so the append-only ledger keeps pointing at them.
  for (const id of planned.remove) {
    const variant = byId.get(id);
    if (!variant) continue;
    if (variant.hasHistory) {
      await tx.productVariantOptionValue.deleteMany({ where: { variantId: id } });
      await tx.$executeRaw`
        UPDATE "ProductVariant" SET "deletedAt" = now(), "optionSignature" = 'deleted:' || id::text, "updatedAt" = now()
        WHERE id = ${id}::uuid`;
      softDeleted += 1;
    } else {
      await tx.productVariant.delete({ where: { id }, select: { id: true } });
      hardDeleted += 1;
    }
  }

  // 2. Rebuild the option structure with the same ids (renames, reorders
  //    and removals in one pass; unique positions can't be swapped in place).
  //    Deleting options cascades to values and to the variant links, which
  //    are re-created below for every surviving variant.
  await tx.productOption.deleteMany({ where: { productId } });
  const keyToId = new Map<string, string>();
  const valueText = new Map<string, string>();
  const optionIds: string[] = [];
  for (const option of planned.options) {
    const created = await tx.productOption.create({
      data: {
        ...(option.id ? { id: option.id } : {}),
        organisationId: store.organisationId,
        storeId: store.storeId,
        productId,
        name: option.name,
        position: option.position,
      },
      select: { id: true },
    });
    optionIds.push(created.id);
    for (const value of option.values) {
      const row = await tx.productOptionValue.create({
        data: {
          ...(value.id ? { id: value.id } : {}),
          organisationId: store.organisationId,
          storeId: store.storeId,
          optionId: created.id,
          value: value.value,
          position: value.position,
        },
        select: { id: true },
      });
      keyToId.set(value.key, row.id);
      valueText.set(row.id, value.value);
    }
  }
  const resolve = (combination: readonly string[]) =>
    combination.map((key) => {
      const id = keyToId.get(key);
      if (!id) throw new Error("option plan referenced an unknown value");
      return id;
    });

  // 3. Kept variants: new signature, title and links. Signatures go through
  //    a temporary value first so no two rows ever share one mid-update.
  const kept = planned.keep.map((k) => ({
    variantId: k.variantId,
    values: resolve(k.combination),
  }));
  for (const k of kept) {
    await tx.$executeRaw`UPDATE "ProductVariant" SET "optionSignature" = 'tmp:' || id::text WHERE id = ${k.variantId}::uuid`;
  }
  const order = (values: readonly string[]) =>
    values.reduce(
      (acc, id, i) =>
        acc * 64 + (planned.options[i]?.values.findIndex((v) => keyToId.get(v.key) === id) ?? 0),
      0,
    );

  for (const k of kept) {
    await tx.productVariant.update({
      where: { id: k.variantId },
      data: {
        optionSignature: optionSignature(k.values),
        title: variantTitle(k.values.map((id) => valueText.get(id) ?? "")),
        position: order(k.values),
      },
      select: { id: true },
    });
    await linkValues(tx, store, k.variantId, optionIds, k.values);
  }

  // 4. New combinations: priced and configured like the first existing variant.
  const template =
    loaded.variants.find((v) => kept.some((k) => k.variantId === v.id)) ?? loaded.variants[0];
  const currency =
    template?.currency ??
    (await tx.store.findUniqueOrThrow({ where: { id: store.storeId }, select: { currency: true } }))
      .currency;
  for (const combination of planned.create) {
    const values = resolve(combination);
    const variant = await tx.productVariant.create({
      data: {
        organisationId: store.organisationId,
        storeId: store.storeId,
        productId,
        title: variantTitle(values.map((id) => valueText.get(id) ?? "")),
        optionSignature: optionSignature(values),
        currency,
        priceAmount: template?.priceAmount ?? 0n,
        compareAtAmount: template?.compareAtAmount ?? null,
        costAmount: template?.costAmount ?? null,
        taxable: template?.taxable ?? true,
        requiresShipping: template?.requiresShipping ?? true,
        weightGrams: template?.weightGrams ?? null,
        inventoryPolicy: template?.inventoryPolicy ?? "DENY",
        position: order(values),
      },
      select: { id: true },
    });
    await tx.inventoryItem.create({
      data: {
        organisationId: store.organisationId,
        storeId: store.storeId,
        variantId: variant.id,
        tracked: template?.tracked ?? true,
      },
      select: { id: true },
    });
    await linkValues(tx, store, variant.id, optionIds, values);
  }
  return { softDeleted, hardDeleted };
}

async function linkValues(
  tx: TenantTx,
  store: StoreContext,
  variantId: string,
  optionIds: readonly string[],
  valueIds: readonly string[],
): Promise<void> {
  if (valueIds.length === 0) return;
  await tx.productVariantOptionValue.createMany({
    data: valueIds.map((optionValueId, i) => ({
      organisationId: store.organisationId,
      storeId: store.storeId,
      variantId,
      optionId: optionIds[i] ?? "",
      optionValueId,
    })),
  });
}

// --- the variant matrix -------------------------------------------------------------

/**
 * Saves several variants of one product at once (prices, SKUs, barcodes,
 * cost, shipping, tracking, image). Every variant must belong to the product;
 * SKUs are checked against each other and the store before writing, and the
 * partial unique index still catches a race.
 */
export async function updateVariants(
  ctx: TenantContext,
  productPublicId: string,
  input: unknown,
): Promise<{ updated: number; updatedAt: Date }> {
  const productId = internalId("product", productPublicId);
  const data = parseInput(updateVariantsSchema, input);
  const rows = data.variants.map((v) => ({
    ...v,
    id: internalId("variant", v.variantId),
    image:
      v.imageMediaId === undefined
        ? undefined
        : v.imageMediaId === null
          ? null
          : internalId("media", v.imageMediaId),
  }));
  try {
    return await inStore(
      ctx,
      "product.update",
      async (tx, store) => {
        await lockProductRow(tx, productId);
        const current = await tx.productVariant.findMany({
          where: { id: { in: rows.map((r) => r.id) }, productId, deletedAt: null },
          select: { id: true, currency: true, priceAmount: true, compareAtAmount: true },
        });
        const byId = new Map(current.map((v) => [v.id, v]));
        if (byId.size !== new Set(rows.map((r) => r.id)).size) throw notFound();

        const errors: Record<string, string> = {};
        const skus = new Map<string, number>();
        rows.forEach((row, i) => {
          if (row.sku) {
            const key = row.sku;
            if (skus.has(key))
              errors[`variants.${String(i)}.sku`] = "Each variant needs a different SKU.";
            skus.set(key, i);
          }
        });
        if (skus.size > 0) {
          const clashes = await tx.productVariant.findMany({
            where: {
              sku: { in: [...skus.keys()] },
              deletedAt: null,
              id: { notIn: rows.map((r) => r.id) },
            },
            select: { sku: true },
          });
          for (const clash of clashes) {
            const i = clash.sku === null ? undefined : skus.get(clash.sku);
            if (i !== undefined)
              errors[`variants.${String(i)}.sku`] = "Another variant already uses this SKU.";
          }
        }
        const attachedMedia = new Set(
          (
            await tx.productMedia.findMany({
              where: { productId, mediaAsset: { deletedAt: null, status: "READY" } },
              select: { mediaAssetId: true },
            })
          ).map((m) => m.mediaAssetId),
        );

        const updates = rows.map((row, i) => {
          const existing = byId.get(row.id);
          if (!existing) throw notFound();
          const field = (name: string) => `variants.${String(i)}.${name}`;
          const price =
            row.price === undefined || row.price === ""
              ? row.price === ""
                ? 0n
                : undefined
              : parseMoneyField(field("price"), row.price, existing.currency);
          const compareAt = optionalMoneyField(
            field("compareAtPrice"),
            row.compareAtPrice,
            existing.currency,
          );
          const cost = optionalMoneyField(field("cost"), row.cost, existing.currency);
          const finalPrice = price ?? existing.priceAmount;
          const finalCompare = compareAt === undefined ? existing.compareAtAmount : compareAt;
          if (finalCompare !== null && finalCompare <= finalPrice) {
            errors[field("compareAtPrice")] = "The compare-at price must be higher than the price.";
          }
          if (row.image && !attachedMedia.has(row.image)) {
            errors[field("imageMediaId")] = "Choose one of this product's images.";
          }
          return { row, price, compareAt, cost };
        });
        if (Object.keys(errors).length > 0) {
          throw new DomainError(
            "VALIDATION_FAILED",
            "Please correct the highlighted fields.",
            errors,
          );
        }

        for (const { row, price, compareAt, cost } of updates) {
          await tx.productVariant.update({
            where: { id: row.id },
            data: {
              ...(price !== undefined ? { priceAmount: price } : {}),
              ...(compareAt !== undefined ? { compareAtAmount: compareAt } : {}),
              ...(cost !== undefined ? { costAmount: cost } : {}),
              ...(row.sku !== undefined ? { sku: row.sku } : {}),
              ...(row.barcode !== undefined ? { barcode: row.barcode } : {}),
              ...(row.taxable !== undefined ? { taxable: row.taxable } : {}),
              ...(row.requiresShipping !== undefined
                ? { requiresShipping: row.requiresShipping }
                : {}),
              ...(row.weightGrams !== undefined ? { weightGrams: row.weightGrams } : {}),
              ...(row.inventoryPolicy !== undefined
                ? { inventoryPolicy: row.inventoryPolicy }
                : {}),
              ...(row.image !== undefined ? { imageMediaId: row.image } : {}),
            },
            select: { id: true },
          });
          if (row.trackInventory !== undefined) {
            await tx.inventoryItem.updateMany({
              where: { variantId: row.id },
              data: { tracked: row.trackInventory },
            });
          }
        }
        const product = await tx.product.update({
          where: { id: productId },
          data: { updatedBy: { connect: { id: store.userId } } },
          select: { updatedAt: true },
        });
        await recordAudit(
          tx,
          store,
          "product.variants_updated",
          { type: "Product", id: productId },
          {
            count: updates.length,
          },
        );
        return { updated: updates.length, updatedAt: product.updatedAt };
      },
      { write: true },
    );
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (isUniqueViolation(error)) {
      throw conflict("Another variant in this store already uses that SKU.", {
        sku: "That SKU is already in use.",
      });
    }
    throw error;
  }
}
