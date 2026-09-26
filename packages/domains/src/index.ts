// @storevia/domains (ADR-0028 §12): hostname normalisation and the reserved
// slug list that store creation validates against. Host resolution lives in
// "@storevia/domains/resolver" (server-only, storefront role).
export {
  normaliseHostname,
  platformHostname,
  storefrontOrigin,
  storefrontRootDomain,
} from "./hostname";
export * from "./preview";
export { RESERVED_STORE_SLUGS, STORE_SLUG_RE, storeSlugSchema } from "@storevia/validation";
