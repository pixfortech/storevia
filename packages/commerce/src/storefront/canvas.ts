import "server-only";
import type { LinkTarget, PageDocument } from "@storevia/editor/document";
import { SiteReader } from "@storevia/site-engine/read";
import type { TenantContext } from "@storevia/tenancy";
import { STOREVIA_REGISTRY, type DocumentData } from "../blocks";
import { inStore } from "../internal";
import { StorefrontReader } from "./read";
import { resolveDocumentData } from "./resolve";

/**
 * The data the builder canvas renders a working document with (ADR-0030
 * §6): the same resolver as the storefront, run in the merchant's own
 * store-scoped transaction, with draft pages linkable as in a preview. Only
 * live products and READY media resolve, like on the public site.
 */
export async function loadCanvasData(
  ctx: TenantContext,
  documents: readonly PageDocument[],
  links: readonly LinkTarget[] = [],
): Promise<DocumentData> {
  return inStore(ctx, "design.edit", async (tx) => {
    const { data } = await resolveDocumentData(
      documents,
      STOREVIA_REGISTRY,
      new StorefrontReader(tx),
      new SiteReader(tx, { preview: true }),
      links,
    );
    return data;
  });
}
