import "server-only";
import { DEFAULT_THEME_SETTINGS } from "@storevia/site-engine/theme";
import type { LinkTab } from "@/components/catalogue/link-tabs";
import { env } from "./env";

// The website and theme areas' paths and helpers (ADR-0030).

const inStore = (storeId: string, suffix: string) => `/s/${storeId}${suffix}`;

export const websitePath = (storeId: string, suffix = "") => inStore(storeId, `/website${suffix}`);
export const pagesPath = (storeId: string) => inStore(storeId, "/pages");
/** The Themes area: library (""), "/customise" and "/demo/{theme}" (08-themes.md §10.7). */
export const themesPath = (storeId: string, suffix = "") => inStore(storeId, `/themes${suffix}`);
export const builderPath = (storeId: string, pageId: string) =>
  websitePath(storeId, `/pages/${pageId}`);
/** The Themes area's tabs: the library (with the current theme) and the customiser. */
export function themesTabs(storeId: string, current: "library" | "customise"): LinkTab[] {
  return [
    { href: themesPath(storeId), label: "Theme library", current: current === "library" },
    {
      href: themesPath(storeId, "/customise"),
      label: "Customise",
      current: current === "customise",
    },
  ];
}

export const previewPath = (storeId: string, path = "/") =>
  inStore(storeId, `/preview${path === "/" ? "" : `?path=${encodeURIComponent(path)}`}`);

/** Only the store's own page paths: "/" and "/pages/{handle}" (never another host or a protocol-relative URL). */
const PREVIEW_PATH_RE = /^\/(?:pages\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

/** The page a preview opens: the requested one when it is one of the store's own paths, else the home page. */
export function previewPathFrom(requested: string | null): string {
  return requested !== null && requested.length <= 110 && PREVIEW_PATH_RE.test(requested)
    ? requested
    : "/";
}

export { DEFAULT_THEME_SETTINGS };

/**
 * Media URLs in the dashboard are same-origin paths (they must load on
 * whichever host the dashboard is opened); the read models make them
 * absolute on the configured dashboard origin for the storefront.
 */
export function dashboardMediaUrl(url: string): string {
  const origin = new URL(env().DASHBOARD_URL).origin;
  return url.startsWith(`${origin}/media/`) ? url.slice(origin.length) : url;
}

export function dashboardSrcSet(srcSet: string): string {
  return srcSet
    .split(",")
    .map((part) => {
      const [url, width] = part.trim().split(/\s+/);
      return url ? [dashboardMediaUrl(url), width].filter(Boolean).join(" ") : "";
    })
    .filter(Boolean)
    .join(", ");
}
