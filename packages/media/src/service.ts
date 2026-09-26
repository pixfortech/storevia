import "server-only";
import { withTenant, type TenantTx } from "@storevia/database";
import {
  canConsume,
  consumeUsage,
  limitReached,
  releaseUsage,
  resolveEntitlement,
} from "@storevia/entitlements";
import {
  parseInput,
  parsePublicId,
  recordAudit,
  requirePermission,
  scopeOf,
  type Permission,
  type StoreContext,
  type TenantContext,
} from "@storevia/tenancy";
import { createLogger } from "@storevia/observability";
import { DomainError, notFound, toTypeId, uuidv7 } from "@storevia/types";
import { z } from "zod";
import { mediaStorage } from "./config";
import { objectKey, uploadKey } from "./keys";
import {
  parseRenditions,
  renditionUrls,
  type MediaRenditionView,
  type StoredRendition,
} from "./urls";
import { MediaRejectedError, processImage } from "./process";
import { MEDIA_LIMITS, precheckUpload } from "./sniff";
import type { ObjectStorage, UploadTarget } from "./storage";

// The media library (ADR-0027 §9). Browsers upload straight to storage with a
// short-lived target; completing the upload sniffs, decodes, strips and
// re-encodes the image on the server, and only then does the asset become
// READY and count against media_storage. Every step is store-scoped.

const UPLOAD_TTL_SECONDS = 10 * 60;

export interface MediaView {
  readonly id: string;
  readonly filename: string;
  readonly altText: string | null;
  readonly mimeType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  /** Stored bytes: the cleaned original plus renditions. */
  readonly storedBytes: number;
  readonly createdAt: Date;
  /** Smallest rendition, for thumbnails. */
  readonly thumbnailUrl: string | null;
  readonly srcSet: string;
  readonly renditions: readonly MediaRenditionView[];
  /** Products using this image. */
  readonly productCount: number;
}

function requireStore(ctx: TenantContext, permission: Permission, write: boolean): StoreContext {
  if (ctx.kind !== "store") throw notFound();
  requirePermission(ctx, permission);
  if (write && (ctx.storeStatus === "ARCHIVED" || ctx.storeStatus === "SUSPENDED")) {
    throw new DomainError("CONFLICT", "This store's media can't be changed right now.");
  }
  return ctx;
}

const cleanFilename = (name: string) =>
  (name.split(/[\\/]/).pop() ?? "")
    .normalize("NFC")
    .split("")
    .filter((c) => c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f && !'<>:"|?*'.includes(c))
    .join("")
    .trim()
    .slice(0, 200) || "image";

const createUploadSchema = z.object({
  filename: z.string().max(1000),
  size: z.number().int(),
  contentType: z.string().max(200).optional(),
});

/** Uploads a store may have started in the last hour without finishing (READY). */
const MAX_PENDING_UPLOADS = 20;

/**
 * Starts an upload: records a PENDING_UPLOAD asset and returns a short-lived
 * target for exactly one upload key, accepting at most the declared size
 * (itself at most 20 MB). Raw bytes go under the unserved `uploads/` prefix.
 * The declared type and name are only hints; completeMediaUpload decides by
 * the bytes. Unfinished uploads are capped per store, because their bytes
 * aren't counted until they complete.
 */
export async function createMediaUpload(
  ctx: TenantContext,
  input: unknown,
): Promise<{ readonly mediaId: string; readonly upload: UploadTarget }> {
  const store = requireStore(ctx, "media.manage", true);
  const data = parseInput(createUploadSchema, input);
  const problem = precheckUpload({ filename: data.filename, size: data.size });
  if (problem) throw new DomainError("VALIDATION_FAILED", problem, { file: problem });
  const id = uuidv7();
  const key = uploadKey({
    organisationId: store.organisationId,
    storeId: store.storeId,
    mediaId: id,
  });
  await withTenant(scopeOf(store), async (tx) => {
    // Every upload started in the last hour that didn't become READY counts,
    // deleted or rejected ones included: their upload targets stay valid
    // until they expire, so freeing the slot early would let raw bytes in
    // that nothing meters.
    const pending = await tx.mediaAsset.count({
      where: {
        status: { not: "READY" },
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (pending >= MAX_PENDING_UPLOADS) {
      throw new DomainError(
        "RATE_LIMITED",
        "Too many uploads are still in progress. Wait for them to finish, then try again.",
      );
    }
    // A hint only (no lock): the quota is enforced when the upload completes.
    if (
      !(await canConsume(tx, store.organisationId, "media_storage", { amount: BigInt(data.size) }))
    ) {
      const resolved = await resolveEntitlement(tx, store.organisationId, "media_storage");
      throw limitReached(
        resolved.name,
        resolved.value.kind === "LIMIT" ? resolved.value.limit : 0n,
      );
    }
    await tx.mediaAsset.create({
      data: {
        id,
        organisationId: store.organisationId,
        storeId: store.storeId,
        kind: "IMAGE",
        status: "PENDING_UPLOAD",
        filename: cleanFilename(data.filename),
        declaredMimeType: (data.contentType ?? "application/octet-stream").slice(0, 100),
        storageKey: key,
        createdById: store.userId,
      },
      select: { id: true },
    });
  });
  const upload = await mediaStorage().createUploadTarget(key, {
    maxBytes: data.size,
    expiresInSeconds: UPLOAD_TTL_SECONDS,
  });
  return { mediaId: toTypeId("media", id), upload };
}

/** Ends a claimed upload that can't finish, so it never stays PROCESSING. */
async function markRejected(store: StoreContext, id: string): Promise<void> {
  await withTenant(scopeOf(store), (tx) =>
    tx.mediaAsset.updateMany({ where: { id, status: "PROCESSING" }, data: { status: "REJECTED" } }),
  );
}

async function reject(store: StoreContext, id: string, message: string): Promise<never> {
  await markRejected(store, id);
  throw new DomainError("VALIDATION_FAILED", message, { file: message });
}

/**
 * Image processing is CPU-heavy and runs on libuv's small thread pool, so a
 * process handles at most two at a time: a burst of hostile images (tiny
 * files that decode to 40 MP) can't starve every other request.
 */
const PROCESSING_SLOTS = 2;
let processing = 0;
const waitingForSlot: (() => void)[] = [];

async function withProcessingSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (processing >= PROCESSING_SLOTS) {
    await new Promise<void>((resolve) => waitingForSlot.push(resolve));
  }
  processing += 1;
  try {
    return await fn();
  } finally {
    processing -= 1;
    waitingForSlot.shift()?.();
  }
}

/**
 * Finishes an upload: reads the object (size-capped), sniffs and decodes it,
 * writes a metadata-free original and WebP renditions, deletes the raw
 * upload, and marks the asset READY while consuming media_storage in the
 * same transaction. Anything that isn't an accepted image is rejected and
 * its bytes removed.
 */
export async function completeMediaUpload(
  ctx: TenantContext,
  mediaPublicId: string,
): Promise<MediaView> {
  const store = requireStore(ctx, "media.manage", true);
  const id = parsePublicId("media", mediaPublicId);
  const storage = mediaStorage();
  const owner = { organisationId: store.organisationId, storeId: store.storeId, mediaId: id };

  // Claim the asset so a second completion can't run in parallel.
  const claimed = await withTenant(scopeOf(store), async (tx) => {
    const updated = await tx.mediaAsset.updateMany({
      where: { id, status: "PENDING_UPLOAD", deletedAt: null },
      data: { status: "PROCESSING" },
    });
    if (updated.count === 0) {
      const existing = await tx.mediaAsset.findFirst({ where: { id }, select: { status: true } });
      if (!existing) throw notFound();
      throw new DomainError("CONFLICT", "This upload has already been completed.");
    }
    return tx.mediaAsset.findFirstOrThrow({
      where: { id },
      select: { storageKey: true, filename: true },
    });
  });

  const rawKey = uploadKey(owner);
  let bytes: Uint8Array;
  try {
    const info = await storage.head(rawKey);
    if (!info) return await reject(store, id, "The upload didn't arrive. Try again.");
    if (info.size > MEDIA_LIMITS.maxBytes) {
      await storage.delete(rawKey);
      return await reject(store, id, "Images can be up to 20 MB.");
    }
    bytes = await storage.read(rawKey, { maxBytes: MEDIA_LIMITS.maxBytes });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    return reject(store, id, "The upload couldn't be read. Try again.");
  }

  let processed;
  try {
    processed = await withProcessingSlot(() => processImage(bytes));
  } catch (error) {
    await storage.delete(rawKey).catch(() => undefined);
    if (error instanceof MediaRejectedError) return reject(store, id, error.message);
    await markRejected(store, id);
    throw error;
  }

  const originalKey = objectKey(owner, `original.${processed.extension}`);
  const written: string[] = [];
  const renditions: StoredRendition[] = [];
  try {
    await storage.write(originalKey, processed.original, processed.mimeType);
    written.push(originalKey);
    for (const r of processed.renditions) {
      const key = objectKey(owner, `w${String(r.target)}.webp`);
      await storage.write(key, r.data, "image/webp");
      written.push(key);
      renditions.push({
        key,
        width: r.width,
        height: r.height,
        format: "webp",
        bytes: r.data.byteLength,
      });
    }
  } catch (error) {
    await Promise.all(written.map((k) => storage.delete(k).catch(() => undefined)));
    await storage.delete(rawKey).catch(() => undefined);
    await markRejected(store, id);
    throw error;
  }
  await storage.delete(rawKey);
  const storedBytes = processed.original.byteLength + renditions.reduce((n, r) => n + r.bytes, 0);

  try {
    return await withTenant(scopeOf(store), async (tx) => {
      await consumeUsage(tx, store.organisationId, "media_storage", {
        amount: BigInt(storedBytes),
      });
      const updated = await tx.mediaAsset.updateMany({
        where: { id, status: "PROCESSING" },
        data: {
          status: "READY",
          mimeType: processed.mimeType,
          sizeBytes: BigInt(processed.original.byteLength),
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
          storageKey: originalKey,
          renditions: renditions.map((r) => ({ ...r })),
        },
      });
      if (updated.count === 0) throw new DomainError("CONFLICT", "This upload was cancelled.");
      await recordAudit(
        tx,
        store,
        "media.uploaded",
        { type: "MediaAsset", id },
        {
          filename: claimed.filename,
          bytes: storedBytes,
        },
      );
      return toView(tx, id, storage);
    });
  } catch (error) {
    await Promise.all(written.map((k) => storage.delete(k).catch(() => undefined)));
    await withTenant(scopeOf(store), (tx) =>
      tx.mediaAsset.updateMany({
        where: { id, status: "PROCESSING" },
        data: { status: "REJECTED" },
      }),
    );
    throw error;
  }
}

const viewSelect = {
  id: true,
  filename: true,
  altText: true,
  mimeType: true,
  width: true,
  height: true,
  sizeBytes: true,
  renditions: true,
  createdAt: true,
  _count: { select: { productMedia: { where: { product: { deletedAt: null } } } } },
} as const;

interface ViewRow {
  id: string;
  filename: string;
  altText: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: bigint | null;
  renditions: unknown;
  createdAt: Date;
  _count: { productMedia: number };
}

function rowToView(row: ViewRow, storage: ObjectStorage): MediaView {
  const urls = renditionUrls(row.renditions, storage);
  const renditionBytes = parseRenditions(row.renditions).reduce((n, r) => n + r.bytes, 0);
  return {
    id: toTypeId("media", row.id),
    filename: row.filename,
    altText: row.altText,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    storedBytes: Number(row.sizeBytes ?? 0n) + renditionBytes,
    createdAt: row.createdAt,
    ...urls,
    productCount: row._count.productMedia,
  };
}

async function toView(tx: TenantTx, id: string, storage: ObjectStorage): Promise<MediaView> {
  const row = await tx.mediaAsset.findFirst({ where: { id, deletedAt: null }, select: viewSelect });
  if (!row) throw notFound();
  return rowToView(row, storage);
}

/** The store's ready media, newest first, with keyset pagination. */
export async function listMedia(
  ctx: TenantContext,
  options: {
    readonly q?: string | undefined;
    readonly before?: string | undefined;
    readonly limit?: number;
  } = {},
): Promise<{ readonly items: readonly MediaView[]; readonly nextCursor: string | null }> {
  const store = requireStore(ctx, "media.read", false);
  const limit = Math.min(Math.max(options.limit ?? 48, 1), 100);
  let before: string | null = null;
  if (options.before) {
    try {
      before = parsePublicId("media", options.before);
    } catch {
      before = null;
    }
  }
  const storage = mediaStorage();
  return withTenant(scopeOf(store), async (tx) => {
    const rows = await tx.mediaAsset.findMany({
      where: {
        deletedAt: null,
        status: "READY",
        ...(options.q
          ? { filename: { contains: options.q.slice(0, 100), mode: "insensitive" as const } }
          : {}),
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit + 1,
      select: viewSelect,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => rowToView(r, storage)),
      nextCursor: rows.length > limit && last ? toTypeId("media", last.id) : null,
    };
  });
}

export async function getMedia(ctx: TenantContext, mediaPublicId: string): Promise<MediaView> {
  const store = requireStore(ctx, "media.read", false);
  const id = parsePublicId("media", mediaPublicId);
  return withTenant(scopeOf(store), (tx) => toView(tx, id, mediaStorage()));
}

const altSchema = z.object({
  altText: z
    .string()
    .trim()
    .max(512, "Use at most 512 characters.")
    .transform((v) => (v === "" ? null : v)),
});

export async function updateMediaAlt(
  ctx: TenantContext,
  mediaPublicId: string,
  input: unknown,
): Promise<void> {
  const store = requireStore(ctx, "media.manage", true);
  const id = parsePublicId("media", mediaPublicId);
  const data = parseInput(altSchema, input);
  await withTenant(scopeOf(store), async (tx) => {
    const updated = await tx.mediaAsset.updateMany({
      where: { id, deletedAt: null, status: "READY" },
      data: { altText: data.altText },
    });
    if (updated.count === 0) throw notFound();
  });
}

const log = createLogger({ component: "media" });

/**
 * Deletes an asset nothing uses (refused while products, variants,
 * collections or the store use it): the row is soft-deleted and its bytes stop
 * counting against the plan, and then its stored files are removed, so
 * deleting can't be used to keep serving files while freeing the quota.
 */
export async function deleteMedia(ctx: TenantContext, mediaPublicId: string): Promise<void> {
  const store = requireStore(ctx, "media.manage", true);
  const id = parsePublicId("media", mediaPublicId);
  const keys = await withTenant(scopeOf(store), async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string;
        status: string;
        sizeBytes: bigint | null;
        renditions: unknown;
        filename: string;
        storageKey: string;
      }[]
    >`
      SELECT id, status::text AS status, "sizeBytes", renditions, filename, "storageKey"
      FROM "MediaAsset"
      WHERE id = ${id}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
    const asset = rows[0];
    if (!asset) throw notFound();
    // One query at a time: a transaction has a single connection.
    const products = await tx.productMedia.count({
      where: { mediaAssetId: id, product: { deletedAt: null } },
    });
    const variants = await tx.productVariant.count({
      where: { imageMediaId: id, deletedAt: null },
    });
    const collections = await tx.collection.count({
      where: { imageMediaId: id, deletedAt: null },
    });
    const stores = await tx.store.count({
      where: { OR: [{ logoMediaId: id }, { faviconMediaId: id }] },
    });
    const uses = products + variants + collections + stores;
    if (uses > 0) {
      throw new DomainError(
        "CONFLICT",
        `This image is in use (${[
          products ? `${String(products)} product${products === 1 ? "" : "s"}` : "",
          variants ? `${String(variants)} variant${variants === 1 ? "" : "s"}` : "",
          collections ? `${String(collections)} collection${collections === 1 ? "" : "s"}` : "",
          stores ? "the store's branding" : "",
        ]
          .filter(Boolean)
          .join(", ")}). Remove it there first.`,
      );
    }
    await tx.mediaAsset.update({
      where: { id },
      data: { deletedAt: new Date(), status: "DELETED" },
      select: { id: true },
    });
    if (asset.status === "READY") {
      const stored =
        Number(asset.sizeBytes ?? 0n) +
        parseRenditions(asset.renditions).reduce((n, r) => n + r.bytes, 0);
      if (stored > 0)
        await releaseUsage(tx, store.organisationId, "media_storage", { amount: BigInt(stored) });
    }
    await recordAudit(
      tx,
      store,
      "media.deleted",
      { type: "MediaAsset", id },
      { filename: asset.filename },
    );
    const owner = { organisationId: store.organisationId, storeId: store.storeId, mediaId: id };
    return [
      ...new Set([
        asset.storageKey,
        uploadKey(owner),
        ...parseRenditions(asset.renditions).map((r) => r.key),
      ]),
    ];
  });
  // After the commit: nothing references the asset any more (deletion is
  // refused while anything does, and references take a lock on the asset).
  const storage = mediaStorage();
  for (const key of keys) {
    await storage.delete(key).catch((error: unknown) => {
      log.warn("media object not deleted", {
        key,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }
}
