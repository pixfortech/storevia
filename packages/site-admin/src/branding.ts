import "server-only";
import { parseInput, parsePublicId, recordAudit, type TenantContext } from "@storevia/tenancy";
import { notFound, toTypeId } from "@storevia/types";
import { z } from "zod";
import { inSite, invalid, type TenantTx } from "./internal";

// The store's logo and favicon (final pass, Phase 2A). Both are images from
// the store's own media library (one media pipeline: uploads are sniffed,
// stripped and re-encoded into WebP renditions before they are READY), kept
// as Store.logoMediaId / faviconMediaId. The header shows the logo (the
// store's name when there is none) and every page links the favicon's
// smallest rendition as its icon (the browser's default icon when there is
// none).
//
// design.edit, like the rest of the site's presentation. There is no draft:
// a change is live at once, like menus. The Store row's outbox trigger
// emits store.changed, which invalidates every cached page of the store.
//
// The media id comes from the browser, so it is checked here, in the write
// transaction, under the store's RLS scope (and explicitly against the
// store): another store's media reads as missing (404), and only a READY,
// undeleted image with renditions can be used. The row is locked (FOR
// SHARE) so deleting the image can't interleave (deleteMedia refuses
// images the store's branding uses); the database's same-store trigger
// checks the reference again.

export const BRAND_IMAGE_SLOTS = ["logo", "favicon"] as const;
export type BrandImageSlot = (typeof BRAND_IMAGE_SLOTS)[number];

export interface StoreBrandingView {
  /** Public media ids, or null when the store has none (name as text; default icon). */
  readonly logoMediaId: string | null;
  readonly faviconMediaId: string | null;
}

/** A favicon's longest side may be at most this many times its shortest. */
export const FAVICON_MAX_ASPECT = 2;

const COLUMN = { logo: "logoMediaId", favicon: "faviconMediaId" } as const;

const LABEL: Record<BrandImageSlot, string> = { logo: "logo", favicon: "favicon" };

const setSchema = z.strictObject({
  slot: z.enum(BRAND_IMAGE_SLOTS),
  /** A media id from the store's library, or null to remove the image. */
  mediaId: z.string().max(100).nullable(),
});

interface StoreRow {
  logoMediaId: string | null;
  faviconMediaId: string | null;
}

async function storeRow(tx: TenantTx, storeId: string): Promise<StoreRow> {
  const rows = await tx.$queryRaw<StoreRow[]>`
    SELECT "logoMediaId", "faviconMediaId" FROM "Store" WHERE id = ${storeId}::uuid`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

const view = (row: StoreRow): StoreBrandingView => ({
  logoMediaId: row.logoMediaId ? toTypeId("media", row.logoMediaId) : null,
  faviconMediaId: row.faviconMediaId ? toTypeId("media", row.faviconMediaId) : null,
});

/** The store's current logo and favicon (ids; the media library has their images). */
export async function getStoreBranding(ctx: TenantContext): Promise<StoreBrandingView> {
  return inSite(ctx, "design.edit", async (tx, store) => view(await storeRow(tx, store.storeId)));
}

interface MediaRow {
  kind: string;
  status: string;
  width: number | null;
  height: number | null;
  rendition_width: number | null;
  rendition_height: number | null;
  renditions: number;
}

/** Refuses anything but a READY image of this store with renditions. */
async function usableImage(
  tx: TenantTx,
  storeId: string,
  mediaId: string,
  slot: BrandImageSlot,
): Promise<void> {
  const rows = await tx.$queryRaw<MediaRow[]>`
    SELECT kind::text AS kind, status::text AS status, width, height,
           (renditions -> 0 ->> 'width')::int AS rendition_width,
           (renditions -> 0 ->> 'height')::int AS rendition_height,
           CASE WHEN jsonb_typeof(renditions) = 'array' THEN jsonb_array_length(renditions) ELSE 0 END
             AS renditions
    FROM "MediaAsset"
    WHERE id = ${mediaId}::uuid AND "storeId" = ${storeId}::uuid AND "deletedAt" IS NULL
    FOR SHARE`;
  const media = rows[0];
  if (!media || media.status === "DELETED") throw notFound();
  const refuse = (message: string) => invalid(message, { mediaId: message });
  if (media.kind !== "IMAGE") throw refuse(`Choose an image for the ${LABEL[slot]}.`);
  if (media.status === "REJECTED")
    throw refuse("That image couldn't be processed. Choose or upload another one.");
  if (media.status !== "READY" || media.renditions === 0)
    throw refuse("That image is still being processed. Try again in a moment.");
  if (slot === "favicon") {
    const width = media.width ?? media.rendition_width;
    const height = media.height ?? media.rendition_height;
    if (width && height && Math.max(width, height) > FAVICON_MAX_ASPECT * Math.min(width, height)) {
      throw refuse(
        "Browsers show the favicon as a small square: choose a square image, or one close to square.",
      );
    }
  }
}

/**
 * Sets (or with `mediaId: null` removes) the store's logo or favicon. Live
 * at once: every cached page of the store is invalidated. Setting the image
 * the store already uses changes nothing and records nothing.
 */
export async function setStoreBrandImage(
  ctx: TenantContext,
  input: unknown,
): Promise<StoreBrandingView> {
  const data = parseInput(setSchema, input);
  const mediaId = data.mediaId === null ? null : parsePublicId("media", data.mediaId);
  return inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      if (mediaId !== null) await usableImage(tx, store.storeId, mediaId, data.slot);
      const current = await storeRow(tx, store.storeId);
      const column = COLUMN[data.slot];
      if (current[column] === mediaId) return view(current);
      const updated = await tx.store.update({
        where: { id: store.storeId },
        data: data.slot === "logo" ? { logoMediaId: mediaId } : { faviconMediaId: mediaId },
        select: { logoMediaId: true, faviconMediaId: true },
      });
      await recordAudit(
        tx,
        store,
        `store.${data.slot}_${mediaId === null ? "removed" : "set"}`,
        { type: "Store", id: store.storeId },
        {
          ...(mediaId === null ? {} : { mediaId: toTypeId("media", mediaId) }),
          ...(current[column] ? { previousMediaId: toTypeId("media", current[column]) } : {}),
        },
      );
      return view(updated);
    },
    { write: true },
  );
}
