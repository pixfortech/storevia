import "server-only";
import { parseInput, recordAudit, requirePermission, type TenantContext } from "@storevia/tenancy";
import { DomainError, notFound } from "@storevia/types";
import { bulkProductActionSchema, PRODUCT_TAG_LIMIT } from "@storevia/validation";
import { addProductsToCollection } from "./collections";
import {
  conflict,
  inStore,
  internalId,
  requireStoreContext,
  requireWritableStore,
} from "./internal";
import {
  archiveProduct,
  forEachProduct,
  FREE_PRODUCT_CODE,
  restoreProduct,
  setProductStatus,
  type BulkResult,
} from "./products";

/** Why a product priced at 0 was left as it was by "Set as active" in bulk. */
export const FREE_BULK_MESSAGE =
  "It's priced at 0, so it wasn't published. Open the product to publish it as a free product.";

// Bulk product actions (ADR-0027). Each product is processed on its own, so
// one failure (plan limit, product gone) is reported without undoing the
// rest. Every id is resolved inside the current store's RLS scope, so a
// bulk action can never touch another store's products: their ids are
// reported as not found.

export type BulkProductAction =
  "activate" | "draft" | "archive" | "restore" | "addToCollection" | "addTags" | "removeTags";

const PERMISSION = {
  activate: "product.update",
  draft: "product.update",
  addTags: "product.update",
  removeTags: "product.update",
  archive: "product.archive",
  restore: "product.archive",
  addToCollection: "collection.manage",
} as const;

export async function bulkProductAction(ctx: TenantContext, input: unknown): Promise<BulkResult> {
  const data = parseInput(bulkProductActionSchema, input);
  const store = requireStoreContext(ctx);
  // Checked up front so a missing permission fails the whole request, not each row.
  requirePermission(store, PERMISSION[data.action]);
  requireWritableStore(store);

  switch (data.action) {
    case "activate":
      // A product priced at 0 is never published in bulk: it is reported
      // back, to be confirmed on its own page.
      return forEachProduct(data.productIds, async (id) => {
        try {
          await setProductStatus(store, id, "ACTIVE");
        } catch (error) {
          if (error instanceof DomainError && error.code === FREE_PRODUCT_CODE) {
            throw conflict(FREE_BULK_MESSAGE);
          }
          throw error;
        }
      });
    case "draft":
      return forEachProduct(data.productIds, (id) => setProductStatus(store, id, "DRAFT"));
    case "archive":
      return forEachProduct(data.productIds, (id) => archiveProduct(store, id));
    case "restore":
      return forEachProduct(data.productIds, (id) => restoreProduct(store, id));
    case "addToCollection": {
      const valid = data.productIds.filter((id) => {
        try {
          internalId("product", id);
          return true;
        } catch {
          return false;
        }
      });
      const result = await addProductsToCollection(store, data.collectionId, { productIds: valid });
      const missing = new Set([
        ...result.missing,
        ...data.productIds.filter((id) => !valid.includes(id)),
      ]);
      return {
        succeeded: data.productIds.filter((id) => !missing.has(id)),
        failed: [...missing].map((id) => ({ id, message: "Not found." })),
      };
    }
    case "addTags":
    case "removeTags": {
      const tags = data.tags;
      const folded = new Set(tags.map((t) => t.toLocaleLowerCase("en")));
      return forEachProduct(data.productIds, (id) =>
        inStore(
          store,
          "product.update",
          async (tx, s) => {
            const productId = internalId("product", id);
            const rows = await tx.$queryRaw<{ tags: string[] }[]>`
              SELECT tags FROM "Product" WHERE id = ${productId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
            const current = rows[0];
            if (!current) throw notFound();
            let next: string[];
            if (data.action === "addTags") {
              const have = new Set(current.tags.map((t) => t.toLocaleLowerCase("en")));
              next = [...current.tags, ...tags.filter((t) => !have.has(t.toLocaleLowerCase("en")))];
            } else {
              next = current.tags.filter((t) => !folded.has(t.toLocaleLowerCase("en")));
            }
            if (next.length > PRODUCT_TAG_LIMIT) {
              throw conflict(`A product can have at most ${String(PRODUCT_TAG_LIMIT)} tags.`);
            }
            if (next.length === current.tags.length && next.every((t, i) => t === current.tags[i]))
              return;
            await tx.product.update({
              where: { id: productId },
              data: { tags: next, updatedBy: { connect: { id: s.userId } } },
              select: { id: true },
            });
            await recordAudit(
              tx,
              s,
              "product.updated",
              { type: "Product", id: productId },
              { fields: "tags" },
            );
          },
          { write: true },
        ),
      );
    }
  }
}
