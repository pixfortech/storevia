import "server-only";
import { platformDb } from "@storevia/database/platform";
import { parsePublicId } from "@storevia/tenancy";
import { requirePlatformPermission, type PlatformContext } from "@storevia/tenancy/platform";
import { toTypeId } from "@storevia/types";

// Read-only catalogue diagnostics for platform staff (ADR-0027 §14): counts
// only, never catalogue content. They live beside the other staff read
// models (admin.ts) because the platform role is confined to this package
// and the platform-admin app. That role holds column-level SELECT on ids,
// statuses, sizes and stock figures and nothing else (migration
// 20260928000000 §6), so these queries could not read titles, prices or
// descriptions even if they tried.

export interface StoreCatalogueCounts {
  /** Public id ("store_…"). */
  readonly storeId: string;
  readonly name: string;
  readonly products: number;
}

export interface CatalogueDiagnostics {
  readonly products: { readonly active: number; readonly draft: number; readonly archived: number };
  readonly variants: number;
  readonly locations: number;
  readonly trackedItems: number;
  /** Levels whose reserved units exceed what's on hand: should always be 0. */
  readonly overReservedLevels: number;
  /** Levels below zero (allowed only for variants that may oversell). */
  readonly negativeLevels: number;
  readonly media: {
    readonly ready: number;
    readonly inProgress: number;
    readonly rejected: number;
    /** Bytes of ready originals and renditions, as media_storage counts them. */
    readonly bytes: bigint;
  };
  /** Products per store, busiest first. */
  readonly stores: readonly StoreCatalogueCounts[];
}

const count = (value: bigint | number | null | undefined): number => Number(value ?? 0);

export async function getCatalogueDiagnostics(
  ctx: PlatformContext,
  organisationId: string,
): Promise<CatalogueDiagnostics> {
  requirePlatformPermission(ctx, "platform.organisation.read");
  const orgId = parsePublicId("organisation", organisationId);
  const db = platformDb();

  const [products, variants, locations, levels, media, bytes, stores] = await Promise.all([
    db.$queryRaw<{ status: string; n: bigint }[]>`
      SELECT status::text AS status, count(*) AS n FROM "Product"
      WHERE "organisationId" = ${orgId}::uuid AND "deletedAt" IS NULL
      GROUP BY status`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "ProductVariant"
      WHERE "organisationId" = ${orgId}::uuid AND "deletedAt" IS NULL`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Location"
      WHERE "organisationId" = ${orgId}::uuid AND "deletedAt" IS NULL AND "isActive"`,
    db.$queryRaw<{ tracked: bigint; over: bigint; negative: bigint }[]>`
      SELECT
        (SELECT count(*) FROM "InventoryItem"
          WHERE "organisationId" = ${orgId}::uuid AND tracked) AS tracked,
        (SELECT count(*) FROM "InventoryLevel"
          WHERE "organisationId" = ${orgId}::uuid AND reserved > GREATEST(available, 0)) AS over,
        (SELECT count(*) FROM "InventoryLevel"
          WHERE "organisationId" = ${orgId}::uuid AND available < 0) AS negative`,
    db.$queryRaw<{ status: string; n: bigint }[]>`
      SELECT status::text AS status, count(*) AS n FROM "MediaAsset"
      WHERE "organisationId" = ${orgId}::uuid AND "deletedAt" IS NULL
      GROUP BY status`,
    // The same figure the media_storage gauge reads (the SECURITY DEFINER
    // function accepts the platform role, which carries no tenant scope).
    db.$queryRaw<{ bytes: bigint | null }[]>`
      SELECT app_usage_media_bytes(${orgId}::uuid) AS bytes`,
    db.$queryRaw<{ storeId: string; n: bigint }[]>`
      SELECT "storeId", count(*) AS n FROM "Product"
      WHERE "organisationId" = ${orgId}::uuid AND "deletedAt" IS NULL
      GROUP BY "storeId" ORDER BY n DESC, "storeId" LIMIT 20`,
  ]);

  const names = new Map(
    (
      await db.store.findMany({
        where: { organisationId: orgId, id: { in: stores.map((s) => s.storeId) } },
        select: { id: true, name: true },
      })
    ).map((s) => [s.id, s.name]),
  );
  const byStatus = (rows: readonly { status: string; n: bigint }[], ...statuses: string[]) =>
    rows.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + count(r.n), 0);

  return {
    products: {
      active: byStatus(products, "ACTIVE"),
      draft: byStatus(products, "DRAFT"),
      archived: byStatus(products, "ARCHIVED"),
    },
    variants: count(variants[0]?.n),
    locations: count(locations[0]?.n),
    trackedItems: count(levels[0]?.tracked),
    overReservedLevels: count(levels[0]?.over),
    negativeLevels: count(levels[0]?.negative),
    media: {
      ready: byStatus(media, "READY"),
      inProgress: byStatus(media, "PENDING_UPLOAD", "PROCESSING"),
      rejected: byStatus(media, "REJECTED"),
      bytes: bytes[0]?.bytes ?? 0n,
    },
    stores: stores.map((s) => ({
      storeId: toTypeId("store", s.storeId),
      name: names.get(s.storeId) ?? "Unknown store",
      products: count(s.n),
    })),
  };
}
