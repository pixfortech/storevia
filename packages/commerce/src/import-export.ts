import "server-only";
import { assertFeature } from "@storevia/entitlements";
import { recordAudit, type TenantContext } from "@storevia/tenancy";
import { inStore, publicId } from "./internal";
import { toDecimalString } from "./money";

// Catalogue import and export (ADR-0027). Services depend on these
// interfaces; CSV export ships in M3, import is deferred (the interface
// fixes its contract: a dry run that reports per-row problems before
// anything is written, then an apply that goes through the same services
// and limits as the editor).

export interface ExportedVariantRow {
  readonly productId: string;
  readonly handle: string;
  readonly title: string;
  readonly status: string;
  readonly vendor: string;
  readonly productType: string;
  readonly tags: string;
  readonly variantId: string;
  readonly variantTitle: string;
  readonly option1: string;
  readonly option2: string;
  readonly option3: string;
  readonly sku: string;
  readonly barcode: string;
  readonly price: string;
  readonly compareAtPrice: string;
  readonly cost: string;
  readonly currency: string;
  readonly tracked: string;
  readonly available: string;
}

export interface ProductExporter {
  readonly contentType: string;
  readonly extension: string;
  serialise(rows: readonly ExportedVariantRow[]): string;
}

export interface ImportProblem {
  readonly row: number;
  readonly field: string;
  readonly message: string;
}

export interface ProductImporter {
  /** Parses and validates without writing; never partially applies. */
  dryRun(
    ctx: TenantContext,
    file: Uint8Array,
  ): Promise<{ readonly rows: number; readonly problems: readonly ImportProblem[] }>;
  apply(
    ctx: TenantContext,
    file: Uint8Array,
  ): Promise<{ readonly created: number; readonly updated: number }>;
}

const COLUMNS: readonly (keyof ExportedVariantRow)[] = [
  "productId",
  "handle",
  "title",
  "status",
  "vendor",
  "productType",
  "tags",
  "variantId",
  "variantTitle",
  "option1",
  "option2",
  "option3",
  "sku",
  "barcode",
  "price",
  "compareAtPrice",
  "cost",
  "currency",
  "tracked",
  "available",
];

/**
 * RFC 4180 CSV. Cells that a spreadsheet would treat as a formula
 * (= + - @, tab, carriage return) are prefixed with an apostrophe so an
 * exported file can't execute anything when opened (CSV injection).
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const csvExporter: ProductExporter = {
  contentType: "text/csv; charset=utf-8",
  extension: "csv",
  serialise(rows) {
    const lines = [COLUMNS.join(",")];
    for (const row of rows) lines.push(COLUMNS.map((c) => csvCell(row[c])).join(","));
    return `${lines.join("\r\n")}\r\n`;
  },
};

export const EXPORT_ROW_LIMIT = 10_000;

/** Every live variant of the store's non-archived (or all) products, in handle order. */
export async function exportProducts(
  ctx: TenantContext,
  options: { readonly includeArchived?: boolean; readonly exporter?: ProductExporter } = {},
): Promise<{
  readonly body: string;
  readonly contentType: string;
  readonly filename: string;
  readonly rows: number;
}> {
  const exporter = options.exporter ?? csvExporter;
  return inStore(ctx, "product.read", async (tx, store) => {
    // Plan-gated through the entitlement engine, like every feature.
    await assertFeature(tx, store.organisationId, "export");
    const products = await tx.product.findMany({
      where: {
        deletedAt: null,
        ...(options.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
      },
      orderBy: [{ handle: "asc" }],
      take: EXPORT_ROW_LIMIT,
      select: {
        id: true,
        handle: true,
        title: true,
        status: true,
        vendor: true,
        productType: true,
        tags: true,
        variants: {
          where: { deletedAt: null },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            sku: true,
            barcode: true,
            currency: true,
            priceAmount: true,
            compareAtAmount: true,
            costAmount: true,
            optionValues: {
              select: {
                option: { select: { position: true } },
                optionValue: { select: { value: true } },
              },
            },
            inventoryItem: {
              select: {
                tracked: true,
                levels: {
                  where: { location: { isActive: true, deletedAt: null } },
                  select: { available: true },
                },
              },
            },
          },
        },
      },
    });
    const rows: ExportedVariantRow[] = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (rows.length >= EXPORT_ROW_LIMIT) break;
        const option = (position: number) =>
          v.optionValues.find((o) => o.option.position === position)?.optionValue.value ?? "";
        const amount = (value: bigint | null) =>
          value === null ? "" : toDecimalString({ amount: value, currency: v.currency });
        rows.push({
          productId: publicId("product", p.id),
          handle: p.handle,
          title: p.title,
          status: p.status,
          vendor: p.vendor ?? "",
          productType: p.productType ?? "",
          tags: p.tags.join(", "),
          variantId: publicId("variant", v.id),
          variantTitle: v.title,
          option1: option(0),
          option2: option(1),
          option3: option(2),
          sku: v.sku ?? "",
          barcode: v.barcode ?? "",
          price: amount(v.priceAmount),
          compareAtPrice: amount(v.compareAtAmount),
          cost: amount(v.costAmount),
          currency: v.currency,
          tracked: v.inventoryItem?.tracked ? "yes" : "no",
          available: v.inventoryItem?.tracked
            ? String(v.inventoryItem.levels.reduce((n, l) => n + l.available, 0))
            : "",
        });
      }
    }
    await recordAudit(
      tx,
      store,
      "product.exported",
      { type: "Store", id: store.storeId },
      { count: rows.length },
    );
    const date = new Date().toISOString().slice(0, 10);
    return {
      body: exporter.serialise(rows),
      contentType: exporter.contentType,
      filename: `${store.storeSlug}-products-${date}.${exporter.extension}`,
      rows: rows.length,
    };
  });
}
