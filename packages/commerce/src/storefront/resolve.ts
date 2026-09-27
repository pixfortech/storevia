import "server-only";
import type { LinkTarget, PageDocument } from "@storevia/editor/document";
import type { Registry, SiteRenderContext } from "@storevia/editor/registry";
import { collectRequirements } from "@storevia/editor/render";
import type { SiteReader } from "@storevia/site-engine/read";
import {
  collectionListKey,
  productListKey,
  type CommerceDataRequest,
  type DocumentData,
} from "../blocks";
import type { StorefrontReader } from "./read";

// Resolves everything a page's documents need (ADR-0028 §7, ADR-0030 §2):
// one walk collects the data requests, typed links and media of every
// block, then each kind resolves in one batch (product lists by source
// kind, collection lists, product/collection handles, page handles, media)
// on the caller's transaction. No per-block or per-product queries. Used
// by the storefront (storefront role) and by the builder canvas (the
// merchant's tenant-scoped transaction); both read through the same RLS
// scope, so another store's ids never resolve.

const isCommerceRequest = (r: { kind: string }): r is CommerceDataRequest =>
  r.kind === "product-list" ||
  r.kind === "collection-list" ||
  r.kind === "current-product" ||
  r.kind === "current-collection" ||
  r.kind === "search";

export interface ResolvedDocuments {
  readonly data: DocumentData;
  /** Route-level requests the documents made (current product, collection, search). */
  readonly wants: ReadonlySet<CommerceDataRequest["kind"]>;
}

export async function resolveDocumentData<C extends SiteRenderContext>(
  documents: readonly PageDocument[],
  registry: Registry<C>,
  reader: StorefrontReader,
  site: SiteReader,
  extraLinks: readonly LinkTarget[] = [],
): Promise<ResolvedDocuments> {
  const requests = new Map<string, CommerceDataRequest>();
  const links: LinkTarget[] = [...extraLinks];
  const media = new Set<string>();
  for (const document of documents) {
    const found = collectRequirements(document, registry);
    for (const r of found.requests) {
      if (isCommerceRequest(r)) requests.set(JSON.stringify(r), r);
    }
    links.push(...found.links);
    for (const id of found.media) media.add(id);
  }
  const all = [...requests.values()];
  const productRequests = all.flatMap((r) =>
    r.kind === "product-list" ? [{ source: r.source, limit: r.limit }] : [],
  );
  const collectionRequests = all.flatMap((r) =>
    r.kind === "collection-list" ? [{ source: r.source, limit: r.limit }] : [],
  );
  const ids = (type: string) =>
    links.flatMap((l) => (l.type === type && "id" in l && typeof l.id === "string" ? [l.id] : []));

  const productLists =
    productRequests.length > 0 ? await reader.productLists(productRequests) : new Map();
  const collectionLists =
    collectionRequests.length > 0 ? await reader.collectionLists(collectionRequests) : new Map();
  const handles = await reader.links({ products: ids("product"), collections: ids("collection") });
  const pages = await site.pageLinks(ids("page"));
  const images = media.size > 0 ? await site.media([...media]) : new Map();

  const readerKey = (source: unknown, limit: number) =>
    `${JSON.stringify(source)}:${String(limit)}`;
  return {
    data: {
      productLists: productRequests.map(
        (r) =>
          [
            productListKey(r.source, r.limit),
            productLists.get(readerKey(r.source, r.limit)) ?? [],
          ] as const,
      ),
      collectionLists: collectionRequests.map(
        (r) =>
          [
            collectionListKey(r.source, r.limit),
            collectionLists.get(readerKey(r.source, r.limit)) ?? [],
          ] as const,
      ),
      links: {
        products: [...handles.products],
        collections: [...handles.collections],
        pages: [...pages],
      },
      media: [...images],
    },
    wants: new Set(all.map((r) => r.kind)),
  };
}
