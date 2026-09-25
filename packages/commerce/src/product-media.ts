import "server-only";
import { parseInput, recordAudit, type TenantContext } from "@storevia/tenancy";
import { notFound } from "@storevia/types";
import { productMediaOrderSchema } from "@storevia/validation";
import { z } from "zod";
import { conflict, inStore, internalId, validationError, type TenantTx } from "./internal";

// A product's media (ADR-0027 §9): ordered references to media-library
// assets of the same store (composite foreign key). The first is the primary
// image. Removing media from a product never deletes the asset, which may be
// reused elsewhere.

const MAX_PRODUCT_MEDIA = 250;

async function lockProduct(tx: TenantTx, productId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Product" WHERE id = ${productId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  if (rows.length === 0) throw notFound();
}

async function touch(tx: TenantTx, productId: string, userId: string): Promise<void> {
  await tx.product.update({
    where: { id: productId },
    data: { updatedBy: { connect: { id: userId } } },
    select: { id: true },
  });
}

/** Appends library media to a product (skipping media already attached). */
export async function attachProductMedia(
  ctx: TenantContext,
  productPublicId: string,
  input: unknown,
): Promise<{ attached: number }> {
  const productId = internalId("product", productPublicId);
  const data = parseInput(productMediaOrderSchema, input);
  const mediaIds = [...new Set(data.mediaIds.map((id) => internalId("media", id)))];
  return inStore(
    ctx,
    "product.update",
    async (tx, store) => {
      await lockProduct(tx, productId);
      const ready = await tx.mediaAsset.findMany({
        where: { id: { in: mediaIds }, deletedAt: null, status: "READY" },
        select: { id: true },
      });
      if (ready.length !== mediaIds.length) {
        throw validationError("mediaIds", "Choose images from this store's media library.");
      }
      const existing = await tx.productMedia.findMany({
        where: { productId },
        select: { mediaAssetId: true, position: true },
      });
      const attached = new Set(existing.map((m) => m.mediaAssetId));
      const toAttach = mediaIds.filter((id) => !attached.has(id));
      if (existing.length + toAttach.length > MAX_PRODUCT_MEDIA) {
        throw conflict(`A product can have at most ${String(MAX_PRODUCT_MEDIA)} media.`);
      }
      let position = existing.reduce((max, m) => Math.max(max, m.position), -1) + 1;
      if (toAttach.length > 0) {
        await tx.productMedia.createMany({
          data: toAttach.map((mediaAssetId) => ({
            organisationId: store.organisationId,
            storeId: store.storeId,
            productId,
            mediaAssetId,
            position: position++,
          })),
        });
        await touch(tx, productId, store.userId);
        await recordAudit(
          tx,
          store,
          "product.media_added",
          { type: "Product", id: productId },
          {
            mediaCount: toAttach.length,
          },
        );
      }
      return { attached: toAttach.length };
    },
    { write: true },
  );
}

/** Sets the media order; the first becomes the primary image. Must list exactly the attached media. */
export async function reorderProductMedia(
  ctx: TenantContext,
  productPublicId: string,
  input: unknown,
): Promise<void> {
  const productId = internalId("product", productPublicId);
  const data = parseInput(productMediaOrderSchema, input);
  const mediaIds = data.mediaIds.map((id) => internalId("media", id));
  await inStore(
    ctx,
    "product.update",
    async (tx, store) => {
      await lockProduct(tx, productId);
      const existing = await tx.productMedia.findMany({
        where: { productId },
        select: { mediaAssetId: true },
      });
      const current = new Set(existing.map((m) => m.mediaAssetId));
      if (
        mediaIds.length !== current.size ||
        new Set(mediaIds).size !== mediaIds.length ||
        mediaIds.some((id) => !current.has(id))
      ) {
        throw conflict(
          "The product's media changed while you were reordering. Reload and try again.",
        );
      }
      for (const [position, mediaAssetId] of mediaIds.entries()) {
        await tx.productMedia.update({
          where: { productId_mediaAssetId: { productId, mediaAssetId } },
          data: { position },
          select: { id: true },
        });
      }
      await touch(tx, productId, store.userId);
      await recordAudit(
        tx,
        store,
        "product.media_reordered",
        { type: "Product", id: productId },
        {
          mediaCount: mediaIds.length,
        },
      );
    },
    { write: true },
  );
}

/**
 * Removes media from a product (the asset stays in the library). Variants
 * that used it as their image lose the reference in the same transaction.
 */
export async function detachProductMedia(
  ctx: TenantContext,
  productPublicId: string,
  mediaPublicId: string,
): Promise<void> {
  const productId = internalId("product", productPublicId);
  const mediaId = internalId("media", mediaPublicId);
  await inStore(
    ctx,
    "product.update",
    async (tx, store) => {
      await lockProduct(tx, productId);
      const removed = await tx.productMedia.deleteMany({
        where: { productId, mediaAssetId: mediaId },
      });
      if (removed.count === 0) throw notFound();
      await tx.productVariant.updateMany({
        where: { productId, imageMediaId: mediaId },
        data: { imageMediaId: null },
      });
      const remaining = await tx.productMedia.findMany({
        where: { productId },
        orderBy: { position: "asc" },
        select: { mediaAssetId: true },
      });
      for (const [position, row] of remaining.entries()) {
        await tx.productMedia.update({
          where: { productId_mediaAssetId: { productId, mediaAssetId: row.mediaAssetId } },
          data: { position },
          select: { id: true },
        });
      }
      await touch(tx, productId, store.userId);
      await recordAudit(
        tx,
        store,
        "product.media_removed",
        { type: "Product", id: productId },
        {
          mediaCount: 1,
        },
      );
    },
    { write: true },
  );
}

const altSchema = z.object({
  altText: z
    .string()
    .trim()
    .max(512, "Use at most 512 characters.")
    .transform((value) => (value === "" ? null : value)),
});

/** Alt text for this product's use of an image (the library's alt text stays as it is). */
export async function setProductMediaAlt(
  ctx: TenantContext,
  productPublicId: string,
  mediaPublicId: string,
  input: unknown,
): Promise<void> {
  const productId = internalId("product", productPublicId);
  const mediaId = internalId("media", mediaPublicId);
  const data = parseInput(altSchema, input);
  await inStore(
    ctx,
    "product.update",
    async (tx, store) => {
      const updated = await tx.productMedia.updateMany({
        where: { productId, mediaAssetId: mediaId, product: { deletedAt: null } },
        data: { altText: data.altText },
      });
      if (updated.count === 0) throw notFound();
      await touch(tx, productId, store.userId);
    },
    { write: true },
  );
}
