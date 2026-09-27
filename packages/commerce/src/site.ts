import "server-only";
import type { TenantTx } from "@storevia/database";
import type { LinkTarget } from "@storevia/editor/document";
import { parseTypeId } from "@storevia/types";
import { STOREVIA_REGISTRY, collectCatalogueIds, type CommerceRenderContext } from "./blocks";

// Storevia commerce as the Site Engine's composition on the merchant side
// (ADR-0030 §5): the registry pages and menus validate against, and the
// same-store check for the products and collections they name. Runs inside
// the site service's transaction, under the store's RLS scope, so another
// store's ids simply don't exist. Draft and archived records may be named
// (they render as nothing until they're live); deleted ones may not.

const uuids = (kind: "product" | "collection", ids: readonly string[]) => [
  ...new Set(ids.map((id) => parseTypeId(kind, id)).filter((id): id is string => id !== null)),
];

async function checkCatalogueReferences(
  tx: TenantTx,
  refs: { readonly links: readonly LinkTarget[]; readonly values: readonly unknown[] },
): Promise<string[]> {
  const named = collectCatalogueIds(refs.values);
  const linked = (type: string) =>
    refs.links.flatMap((l) =>
      l.type === type && "id" in l && typeof l.id === "string" ? [l.id] : [],
    );
  const products = uuids("product", [...named.products, ...linked("product")]);
  const collections = uuids("collection", [...named.collections, ...linked("collection")]);
  const problems: string[] = [];
  if (products.length > 0) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Product" WHERE id = ANY(${products}::uuid[]) AND "deletedAt" IS NULL`;
    if (rows.length !== products.length) problems.push("A product it names no longer exists.");
  }
  if (collections.length > 0) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Collection" WHERE id = ANY(${collections}::uuid[]) AND "deletedAt" IS NULL`;
    if (rows.length !== collections.length)
      problems.push("A collection it names no longer exists.");
  }
  return problems;
}

/** What the site services need from Storevia commerce (a SiteComposition). */
export const STOREVIA_SITE: {
  readonly registry: typeof STOREVIA_REGISTRY;
  readonly checkReferences: typeof checkCatalogueReferences;
} = { registry: STOREVIA_REGISTRY, checkReferences: checkCatalogueReferences };

export type { CommerceRenderContext };
