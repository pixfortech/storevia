import "server-only";
import type { TenantTx } from "@storevia/database";
import type { LinkTarget } from "@storevia/editor/document";
import type { Registry, SiteRenderContext } from "@storevia/editor/registry";

/**
 * What a composition gives the site services (ADR-0030 §5): the registry
 * documents and menus validate against, and a check that the records its
 * own link kinds and data sources name belong to this store. The services
 * check media and page references themselves. Ordinary typed arguments:
 * there is no runtime registration.
 */
export interface SiteComposition<C extends SiteRenderContext = SiteRenderContext> {
  readonly registry: Registry<C>;
  /**
   * Messages for references the composition owns that don't exist in the
   * store the transaction is scoped to (RLS hides every other store's
   * rows). `values` are validated props and menu items.
   */
  readonly checkReferences?: (
    tx: TenantTx,
    refs: { readonly links: readonly LinkTarget[]; readonly values: readonly unknown[] },
  ) => Promise<string[]>;
}
