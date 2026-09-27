// @storevia/site-admin (ADR-0030 §5): the merchant side of the Site Engine.
// Pages and their draft/publish lifecycle, the store's theme settings and
// its menus, with RBAC, plan checks, validation against the composition's
// registry, same-store reference checks and optimistic concurrency. The
// composition (Storevia commerce) passes its registry and reference check
// as ordinary arguments.
export type { SiteComposition } from "./composition";
export * from "./pages";
export * from "./theme";
export * from "./navigation";
