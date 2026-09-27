import "server-only";
import {
  DOCUMENT_LIMITS,
  validateDocument,
  type LinkTarget,
  type PageDocument,
} from "@storevia/editor/document";
import { SiteReader } from "@storevia/site-engine/read";
import type { TenantContext } from "@storevia/tenancy";
import { STOREVIA_REGISTRY, type DocumentData } from "../blocks";
import { inStore } from "../internal";
import { StorefrontReader } from "./read";
import { resolveDocumentData } from "./resolve";

/**
 * The part of an untrusted working document the canvas resolves data for:
 * its sections that validate on their own, at most the section limit. A
 * section the merchant is halfway through editing (a link being typed) is
 * left out without holding up the others; nothing unvalidated reaches the
 * resolver.
 */
export function canvasDocument(input: unknown, pageKind: "HOME" | "STANDARD"): PageDocument {
  const root =
    typeof input === "object" && input !== null && Array.isArray((input as { root?: unknown }).root)
      ? (input as { root: unknown[] }).root
      : [];
  return {
    schemaVersion: 1,
    root: root.slice(0, DOCUMENT_LIMITS.maxSections).flatMap((node) => {
      const result = validateDocument(
        { schemaVersion: 1, root: [node] },
        { registry: STOREVIA_REGISTRY, pageKind },
      );
      return result.ok ? result.document.root : [];
    }),
  };
}

/**
 * The data the builder canvas renders a working document with (ADR-0030
 * §6): the same resolver as the storefront, run in the merchant's own
 * store-scoped transaction, with draft pages linkable as in a preview. Only
 * live products and READY media resolve, like on the public site.
 */
export async function loadCanvasData(
  ctx: TenantContext,
  document: unknown,
  pageKind: "HOME" | "STANDARD",
  links: readonly LinkTarget[] = [],
): Promise<DocumentData> {
  const checked = canvasDocument(document, pageKind);
  return inStore(ctx, "design.edit", async (tx) => {
    const { data } = await resolveDocumentData(
      [checked],
      STOREVIA_REGISTRY,
      new StorefrontReader(tx),
      new SiteReader(tx, { preview: true }),
      links,
    );
    return data;
  });
}
