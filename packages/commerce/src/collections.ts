import "server-only";
import { Prisma } from "@storevia/database";
import { parseInput, recordAudit, type TenantContext } from "@storevia/tenancy";
import { notFound } from "@storevia/types";
import { collectionProductsSchema, collectionSchema } from "@storevia/validation";
import {
  conflict,
  inStore,
  internalId,
  lockStoreKey,
  publicId,
  publicIdOrNull,
  validationError,
  type TenantTx,
} from "./internal";
import { resolveHandle } from "./products";
import { parseRichText, renderRichTextHtml, RichTextError, type RichTextDoc } from "./rich-text";

// Collections (ADR-0027): manual collections only in M3. Archived, never
// deleted; membership is always between a collection and products of the
// same store (composite foreign keys, plus the RLS scope here).

export type CollectionSortOrder =
  "MANUAL" | "TITLE_ASC" | "TITLE_DESC" | "PRICE_ASC" | "PRICE_DESC" | "CREATED_DESC";

export interface CollectionSummary {
  readonly id: string;
  readonly title: string;
  readonly handle: string;
  readonly productCount: number;
  readonly archivedAt: Date | null;
  readonly updatedAt: Date;
  readonly imageMediaId: string | null;
}

export interface CollectionDetails extends CollectionSummary {
  readonly description: RichTextDoc | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly sortOrder: CollectionSortOrder;
  readonly products: readonly {
    readonly id: string;
    readonly title: string;
    readonly status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    readonly position: number;
  }[];
}

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

async function requireReadyMedia(tx: TenantTx, mediaId: string | null | undefined): Promise<void> {
  if (!mediaId) return;
  const media = await tx.mediaAsset.findFirst({
    where: { id: mediaId, deletedAt: null, status: "READY" },
    select: { id: true },
  });
  if (!media)
    throw validationError("imageMediaId", "Choose an image from this store's media library.");
}

export async function listCollections(
  ctx: TenantContext,
  options: { readonly archived?: boolean; readonly q?: string | undefined } = {},
): Promise<CollectionSummary[]> {
  return inStore(ctx, "collection.read", async (tx) => {
    const rows = await tx.collection.findMany({
      where: {
        deletedAt: null,
        archivedAt: options.archived ? { not: null } : null,
        ...(options.q
          ? { title: { contains: options.q.slice(0, 200), mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: 500,
      select: {
        id: true,
        title: true,
        handle: true,
        archivedAt: true,
        updatedAt: true,
        imageMediaId: true,
        _count: { select: { products: { where: { product: { deletedAt: null } } } } },
      },
    });
    return rows.map((r) => ({
      id: publicId("collection", r.id),
      title: r.title,
      handle: r.handle,
      productCount: r._count.products,
      archivedAt: r.archivedAt,
      updatedAt: r.updatedAt,
      imageMediaId: publicIdOrNull("media", r.imageMediaId),
    }));
  });
}

export async function getCollection(
  ctx: TenantContext,
  collectionPublicId: string,
): Promise<CollectionDetails> {
  const id = internalId("collection", collectionPublicId);
  return inStore(ctx, "collection.read", async (tx) => {
    const row = await tx.collection.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        handle: true,
        archivedAt: true,
        updatedAt: true,
        imageMediaId: true,
        descriptionDoc: true,
        seoTitle: true,
        seoDescription: true,
        sortOrder: true,
        products: {
          where: { product: { deletedAt: null } },
          orderBy: [{ position: "asc" }, { productId: "asc" }],
          take: 500,
          select: { position: true, product: { select: { id: true, title: true, status: true } } },
        },
        _count: { select: { products: { where: { product: { deletedAt: null } } } } },
      },
    });
    if (!row) throw notFound();
    let description: RichTextDoc | null = null;
    try {
      description = parseRichText(row.descriptionDoc);
    } catch {
      // Validated on write; an unreadable document reads as empty.
    }
    return {
      id: publicId("collection", row.id),
      title: row.title,
      handle: row.handle,
      productCount: row._count.products,
      archivedAt: row.archivedAt,
      updatedAt: row.updatedAt,
      imageMediaId: publicIdOrNull("media", row.imageMediaId),
      description,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      sortOrder: row.sortOrder as CollectionSortOrder,
      products: row.products.map((p) => ({
        id: publicId("product", p.product.id),
        title: p.product.title,
        status: p.product.status,
        position: p.position,
      })),
    };
  });
}

export async function createCollection(
  ctx: TenantContext,
  input: unknown,
): Promise<{ collectionId: string }> {
  const data = parseInput(collectionSchema, input);
  const description = parseDescription(data.description) ?? null;
  const imageId = data.imageMediaId ? internalId("media", data.imageMediaId) : null;
  return inStore(
    ctx,
    "collection.manage",
    async (tx, store) => {
      await requireReadyMedia(tx, imageId);
      await lockStoreKey(tx, store.storeId, "collection-handle");
      const handle = await resolveHandle(tx, "Collection", data.handle, data.title);
      const created = await tx.collection.create({
        data: {
          organisationId: store.organisationId,
          storeId: store.storeId,
          title: data.title,
          handle,
          type: "MANUAL",
          sortOrder: data.sortOrder ?? "MANUAL",
          descriptionDoc: jsonOrNull(description),
          descriptionHtml: renderRichTextHtml(description),
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          imageMediaId: imageId,
        },
        select: { id: true },
      });
      await recordAudit(
        tx,
        store,
        "collection.created",
        { type: "Collection", id: created.id },
        {
          title: data.title,
          handle,
        },
      );
      return { collectionId: publicId("collection", created.id) };
    },
    { write: true },
  );
}

export async function updateCollection(
  ctx: TenantContext,
  collectionPublicId: string,
  input: unknown,
): Promise<void> {
  const id = internalId("collection", collectionPublicId);
  const data = parseInput(collectionSchema, input);
  const description = parseDescription(data.description);
  const imageId =
    data.imageMediaId === undefined
      ? undefined
      : data.imageMediaId === null
        ? null
        : internalId("media", data.imageMediaId);
  await inStore(
    ctx,
    "collection.manage",
    async (tx, store) => {
      const current = await tx.collection.findFirst({
        where: { id, deletedAt: null },
        select: { handle: true },
      });
      if (!current) throw notFound();
      await requireReadyMedia(tx, imageId);
      let handle = current.handle;
      if (data.handle && data.handle !== current.handle) {
        await lockStoreKey(tx, store.storeId, "collection-handle");
        handle = await resolveHandle(tx, "Collection", data.handle, data.title, id);
      }
      await tx.collection.update({
        where: { id },
        data: {
          title: data.title,
          handle,
          ...(data.sortOrder ? { sortOrder: data.sortOrder } : {}),
          ...(description !== undefined
            ? {
                descriptionDoc: jsonOrNull(description),
                descriptionHtml: renderRichTextHtml(description),
              }
            : {}),
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          ...(imageId !== undefined ? { imageMediaId: imageId } : {}),
        },
        select: { id: true },
      });
      await recordAudit(
        tx,
        store,
        "collection.updated",
        { type: "Collection", id },
        {
          title: data.title,
          ...(handle !== current.handle ? { handle, previousHandle: current.handle } : {}),
        },
      );
    },
    { write: true },
  );
}

export async function setCollectionArchived(
  ctx: TenantContext,
  collectionPublicId: string,
  archived: boolean,
): Promise<void> {
  const id = internalId("collection", collectionPublicId);
  await inStore(
    ctx,
    "collection.manage",
    async (tx, store) => {
      const updated = await tx.collection.updateMany({
        where: { id, deletedAt: null, archivedAt: archived ? null : { not: null } },
        data: { archivedAt: archived ? new Date() : null },
      });
      if (updated.count === 0) {
        const exists = await tx.collection.findFirst({
          where: { id, deletedAt: null },
          select: { id: true },
        });
        if (!exists) throw notFound();
        return;
      }
      await recordAudit(tx, store, archived ? "collection.archived" : "collection.restored", {
        type: "Collection",
        id,
      });
    },
    { write: true },
  );
}

async function lockCollection(tx: TenantTx, id: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string; archivedAt: Date | null }[]>`
    SELECT id, "archivedAt" FROM "Collection" WHERE id = ${id}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound();
  if (row.archivedAt) throw conflict("Restore this collection before changing its products.");
}

/**
 * Adds products to the end of a collection (already-present products are
 * skipped). Every product must be a live product of this store; ids from
 * elsewhere are reported as not found, never linked.
 */
export async function addProductsToCollection(
  ctx: TenantContext,
  collectionPublicId: string,
  input: unknown,
): Promise<{ added: number; missing: readonly string[] }> {
  const collectionId = internalId("collection", collectionPublicId);
  const data = parseInput(collectionProductsSchema, input);
  const requested = data.productIds.map((pid) => ({ pid, id: internalId("product", pid) }));
  return inStore(
    ctx,
    "collection.manage",
    async (tx, store) => {
      await lockCollection(tx, collectionId);
      const products = await tx.product.findMany({
        where: { id: { in: requested.map((r) => r.id) }, deletedAt: null },
        select: { id: true },
      });
      const found = new Set(products.map((p) => p.id));
      const existing = new Set(
        (
          await tx.collectionProduct.findMany({
            where: { collectionId, productId: { in: [...found] } },
            select: { productId: true },
          })
        ).map((r) => r.productId),
      );
      const last = await tx.collectionProduct.aggregate({
        where: { collectionId },
        _max: { position: true },
      });
      let position = (last._max.position ?? -1) + 1;
      const toAdd = [...new Set(requested.map((r) => r.id))].filter(
        (id) => found.has(id) && !existing.has(id),
      );
      if (toAdd.length > 0) {
        await tx.collectionProduct.createMany({
          data: toAdd.map((productId) => ({
            organisationId: store.organisationId,
            storeId: store.storeId,
            collectionId,
            productId,
            position: position++,
          })),
        });
        await tx.collection.update({
          where: { id: collectionId },
          data: { updatedAt: new Date() },
          select: { id: true },
        });
        await recordAudit(
          tx,
          store,
          "collection.products_added",
          { type: "Collection", id: collectionId },
          {
            count: toAdd.length,
          },
        );
      }
      return {
        added: toAdd.length,
        missing: requested.filter((r) => !found.has(r.id)).map((r) => r.pid),
      };
    },
    { write: true },
  );
}

export async function removeProductsFromCollection(
  ctx: TenantContext,
  collectionPublicId: string,
  input: unknown,
): Promise<{ removed: number }> {
  const collectionId = internalId("collection", collectionPublicId);
  const data = parseInput(collectionProductsSchema, input);
  const ids = data.productIds.map((pid) => internalId("product", pid));
  return inStore(
    ctx,
    "collection.manage",
    async (tx, store) => {
      await lockCollection(tx, collectionId);
      const removed = await tx.collectionProduct.deleteMany({
        where: { collectionId, productId: { in: ids } },
      });
      if (removed.count > 0) {
        await tx.collection.update({
          where: { id: collectionId },
          data: { updatedAt: new Date() },
          select: { id: true },
        });
        await recordAudit(
          tx,
          store,
          "collection.products_removed",
          { type: "Collection", id: collectionId },
          {
            count: removed.count,
          },
        );
      }
      return { removed: removed.count };
    },
    { write: true },
  );
}

/** Sets the manual order: `productIds` lists the collection's products in their new order. */
export async function reorderCollectionProducts(
  ctx: TenantContext,
  collectionPublicId: string,
  input: unknown,
): Promise<void> {
  const collectionId = internalId("collection", collectionPublicId);
  const data = parseInput(collectionProductsSchema, input);
  const ids = data.productIds.map((pid) => internalId("product", pid));
  await inStore(
    ctx,
    "collection.manage",
    async (tx, store) => {
      await lockCollection(tx, collectionId);
      const members = await tx.collectionProduct.findMany({
        where: { collectionId },
        select: { productId: true },
      });
      const memberSet = new Set(members.map((m) => m.productId));
      if (
        ids.length !== memberSet.size ||
        ids.some((id) => !memberSet.has(id)) ||
        new Set(ids).size !== ids.length
      ) {
        throw conflict("The collection changed while you were reordering. Reload and try again.");
      }
      for (const [position, productId] of ids.entries()) {
        await tx.collectionProduct.update({
          where: { collectionId_productId: { collectionId, productId } },
          data: { position },
          select: { productId: true },
        });
      }
      await tx.collection.update({
        where: { id: collectionId },
        data: { sortOrder: "MANUAL", updatedAt: new Date() },
        select: { id: true },
      });
      await recordAudit(
        tx,
        store,
        "collection.reordered",
        { type: "Collection", id: collectionId },
        {
          count: ids.length,
        },
      );
    },
    { write: true },
  );
}
