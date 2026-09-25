import "server-only";
import type { TenantContext } from "@storevia/tenancy";
import { inStore, publicId } from "./internal";
import { LOW_STOCK_THRESHOLD } from "./inventory";
import type { ProductStatus } from "./products";

// Real catalogue numbers for the dashboard home (no revenue, orders,
// conversion or customers: those don't exist until M6 and are never faked).

export interface CatalogueOverview {
  readonly products: {
    readonly total: number;
    readonly active: number;
    readonly draft: number;
    readonly archived: number;
  };
  /** Tracked variants with 0 < available ≤ LOW_STOCK_THRESHOLD across active locations. */
  readonly lowStockVariants: number;
  /** Tracked variants that can't be oversold and have nothing available. */
  readonly outOfStockVariants: number;
  readonly lowStockThreshold: number;
  readonly locations: number;
  readonly collections: number;
  readonly recentlyUpdated: readonly {
    readonly id: string;
    readonly title: string;
    readonly status: ProductStatus;
    readonly updatedAt: Date;
  }[];
  readonly lowStock: readonly {
    readonly productId: string;
    readonly productTitle: string;
    readonly variantTitle: string;
    readonly available: number;
  }[];
}

export async function getCatalogueOverview(ctx: TenantContext): Promise<CatalogueOverview> {
  return inStore(ctx, "product.read", async (tx) => {
    const grouped = await tx.product.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const count = (status: ProductStatus) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;
    const stock = await tx.$queryRaw<{ low: bigint; out: bigint }[]>`
      WITH variant_stock AS (
        SELECT v.id, v."inventoryPolicy", coalesce(sum(l.available) FILTER (WHERE loc.id IS NOT NULL), 0) AS available
        FROM "ProductVariant" v
        JOIN "Product" p ON p.id = v."productId" AND p."deletedAt" IS NULL AND p.status <> 'ARCHIVED'
        JOIN "InventoryItem" ii ON ii."variantId" = v.id AND ii.tracked
        LEFT JOIN "InventoryLevel" l ON l."inventoryItemId" = ii.id
        LEFT JOIN "Location" loc ON loc.id = l."locationId" AND loc."isActive" AND loc."deletedAt" IS NULL
        WHERE v."deletedAt" IS NULL
        GROUP BY v.id, v."inventoryPolicy"
      )
      SELECT count(*) FILTER (WHERE available > 0 AND available <= ${LOW_STOCK_THRESHOLD}) AS low,
             count(*) FILTER (WHERE available <= 0 AND "inventoryPolicy" = 'DENY') AS out
      FROM variant_stock`;
    const lowStock = await tx.$queryRaw<
      { productId: string; productTitle: string; variantTitle: string; available: bigint }[]
    >`
      SELECT p.id AS "productId", p.title AS "productTitle", v.title AS "variantTitle",
             coalesce(sum(l.available) FILTER (WHERE loc.id IS NOT NULL), 0) AS available
      FROM "ProductVariant" v
      JOIN "Product" p ON p.id = v."productId" AND p."deletedAt" IS NULL AND p.status <> 'ARCHIVED'
      JOIN "InventoryItem" ii ON ii."variantId" = v.id AND ii.tracked
      LEFT JOIN "InventoryLevel" l ON l."inventoryItemId" = ii.id
      LEFT JOIN "Location" loc ON loc.id = l."locationId" AND loc."isActive" AND loc."deletedAt" IS NULL
      WHERE v."deletedAt" IS NULL
      GROUP BY p.id, p.title, v.id, v.title, v."inventoryPolicy"
      HAVING coalesce(sum(l.available) FILTER (WHERE loc.id IS NOT NULL), 0) <= ${LOW_STOCK_THRESHOLD}
         AND (v."inventoryPolicy" = 'DENY' OR coalesce(sum(l.available) FILTER (WHERE loc.id IS NOT NULL), 0) > 0)
      ORDER BY available ASC, p.title ASC
      LIMIT 5`;
    const recentlyUpdated = await tx.product.findMany({
      where: { deletedAt: null, status: { not: "ARCHIVED" } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: { id: true, title: true, status: true, updatedAt: true },
    });
    const locations = await tx.location.count({ where: { deletedAt: null, isActive: true } });
    const collections = await tx.collection.count({ where: { deletedAt: null, archivedAt: null } });
    return {
      products: {
        total: count("ACTIVE") + count("DRAFT"),
        active: count("ACTIVE"),
        draft: count("DRAFT"),
        archived: count("ARCHIVED"),
      },
      lowStockVariants: Number(stock[0]?.low ?? 0n),
      outOfStockVariants: Number(stock[0]?.out ?? 0n),
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      locations,
      collections,
      recentlyUpdated: recentlyUpdated.map((p) => ({ ...p, id: publicId("product", p.id) })),
      lowStock: lowStock.map((r) => ({
        productId: publicId("product", r.productId),
        productTitle: r.productTitle,
        variantTitle: r.variantTitle,
        available: Number(r.available),
      })),
    };
  });
}
