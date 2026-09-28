import "server-only";
import { workerDb } from "@storevia/database/worker";
import type { JobDefinition } from "@storevia/jobs";
import { mediaStorage } from "@storevia/media";
import { uploadKey } from "@storevia/media/keys";
import { parseRenditions } from "@storevia/media/urls";
import { logger, recordMetric } from "@storevia/observability";

// Media sweep (M8). Processing runs inline in the upload request; if that
// instance dies mid-way the asset would stay PROCESSING forever. Uploads
// never completed stay PENDING_UPLOAD and count against the store's cap.
// Both end as REJECTED here (the merchant sees a failed upload and can try
// again), and their raw upload objects are removed.

/** Processing takes seconds; anything PROCESSING this long was interrupted. */
export const STUCK_PROCESSING_MINUTES = 15;
/** Upload targets expire after 10 minutes; an hour is well past that. */
export const ABANDONED_UPLOAD_MINUTES = 60;
const BATCH = 200;

interface Swept {
  readonly id: string;
  readonly organisationId: string;
  readonly storeId: string;
  readonly previous: "PROCESSING" | "PENDING_UPLOAD";
}

export async function sweepMedia(): Promise<{ stuck: number; abandoned: number }> {
  const swept = await workerDb().$queryRaw<Swept[]>`
    WITH due AS (
      SELECT id, status AS previous FROM "MediaAsset"
      WHERE (status = 'PROCESSING'
               AND "updatedAt" < now() - make_interval(mins => ${STUCK_PROCESSING_MINUTES}))
         OR (status = 'PENDING_UPLOAD'
               AND "createdAt" < now() - make_interval(mins => ${ABANDONED_UPLOAD_MINUTES}))
      ORDER BY "createdAt"
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED)
    UPDATE "MediaAsset" m SET status = 'REJECTED', "updatedAt" = now()
    FROM due WHERE m.id = due.id
    RETURNING m.id, m."organisationId", m."storeId", due.previous::text AS previous`;
  const storage = swept.length > 0 ? mediaStorage() : null;
  for (const row of swept) {
    const key = uploadKey({
      organisationId: row.organisationId,
      storeId: row.storeId,
      mediaId: row.id,
    });
    await storage?.delete(key).catch((error: unknown) => {
      logger.warn("raw upload not deleted", { mediaId: row.id, error });
    });
  }
  const stuck = swept.filter((r) => r.previous === "PROCESSING").length;
  const abandoned = swept.length - stuck;
  if (stuck > 0) recordMetric("media.stuck_processing_recovered", stuck, {});
  if (abandoned > 0) recordMetric("media.abandoned_uploads", abandoned, {});
  return { stuck, abandoned };
}

/** Deleted assets whose objects aren't confirmed gone after this long are retried. */
export const PURGE_RETRY_MINUTES = 5;

/**
 * S11 (M8): a deleted asset's objects (original, raw upload, renditions)
 * are deleted after the database commit. If that fails, the asset stays
 * DELETED without `objectsPurgedAt` and is retried here until it succeeds,
 * so a deleted image never stays reachable. Deleting an absent object
 * succeeds, so a retry after a partial delete is safe.
 */
export async function purgeDeletedMedia(): Promise<{ purged: number; failed: number }> {
  const db = workerDb();
  const rows = await db.$queryRaw<
    {
      id: string;
      organisationId: string;
      storeId: string;
      storageKey: string;
      renditions: unknown;
    }[]
  >`
    SELECT id, "organisationId", "storeId", "storageKey", renditions FROM "MediaAsset"
    WHERE status = 'DELETED' AND "objectsPurgedAt" IS NULL
      AND coalesce("deletedAt", "updatedAt") < now() - make_interval(mins => ${PURGE_RETRY_MINUTES})
    ORDER BY "deletedAt" NULLS FIRST
    LIMIT ${BATCH}`;
  if (rows.length === 0) return { purged: 0, failed: 0 };
  const storage = mediaStorage();
  let purged = 0;
  let failed = 0;
  for (const row of rows) {
    const keys = new Set([
      row.storageKey,
      uploadKey({ organisationId: row.organisationId, storeId: row.storeId, mediaId: row.id }),
      ...parseRenditions(row.renditions).map((r) => r.key),
    ]);
    try {
      for (const key of keys) await storage.delete(key);
      await db.$executeRaw`
        UPDATE "MediaAsset" SET "objectsPurgedAt" = now() WHERE id = ${row.id}::uuid`;
      purged += 1;
    } catch (error) {
      failed += 1;
      logger.warn("deleted media objects not purged yet", { mediaId: row.id, error });
    }
  }
  if (purged > 0) recordMetric("media.objects_purged", purged, {});
  if (failed > 0) recordMetric("media.object_delete_failed", failed, {});
  return { purged, failed };
}

export const mediaSweepJob: JobDefinition = {
  name: "media.sweep",
  schedule: { everySeconds: 600 },
  maxAttempts: 3,
  timeoutMs: 5 * 60_000,
  async run() {
    return { ...(await sweepMedia()), ...(await purgeDeletedMedia()) };
  },
};
