// @storevia/commerce/blocks (ADR-0030 §2–§4): Storevia commerce as a
// first-party composition over the Site Engine's page system: commerce link
// kinds, the commerce render context, commerce components and section
// blocks, templates and styles, and the Storevia registry (the Site
// Engine's components plus these). Compile-time modules only: no runtime
// registration, no plugin API. Pure and client-safe (the builder uses it).
import {
  createRegistry,
  SITE_COMPONENTS,
  SITE_LINK_KINDS,
  type Registry,
} from "@storevia/editor/registry";
import {
  collectionHeader,
  collectionList,
  collectionProducts,
  featuredProducts,
  productDetail,
  productGrid,
  searchResults,
} from "./components";
import { COMMERCE_LINK_KINDS } from "./links";
import type { CommerceRenderContext } from "./types";

export * from "./types";
export * from "./links";
export * from "./templates";
export { COMMERCE_BLOCK_CSS } from "./css";
export { formatPrice, Pagination, Price, ProductCard, ProductGridList } from "./parts";

/** The registry every Storevia store renders and edits with. */
export const STOREVIA_REGISTRY: Registry<CommerceRenderContext> =
  createRegistry<CommerceRenderContext>({
    linkKinds: [...SITE_LINK_KINDS, ...COMMERCE_LINK_KINDS],
    components: [
      ...SITE_COMPONENTS,
      featuredProducts,
      collectionList,
      productGrid,
      productDetail,
      collectionHeader,
      collectionProducts,
      searchResults,
    ],
  });
export * from "./data";
