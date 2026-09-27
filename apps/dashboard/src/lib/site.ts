import "server-only";
import { DEFAULT_THEME_SETTINGS } from "@storevia/site-engine/theme";
import { env } from "./env";

// The website area's paths and helpers (ADR-0030).

const inStore = (storeId: string, suffix: string) => `/s/${storeId}${suffix}`;

export const websitePath = (storeId: string, suffix = "") => inStore(storeId, `/website${suffix}`);
export const pagesPath = (storeId: string) => inStore(storeId, "/pages");
export const builderPath = (storeId: string, pageId: string) =>
  websitePath(storeId, `/pages/${pageId}`);
export const previewPath = (storeId: string, path = "/") =>
  inStore(storeId, `/preview${path === "/" ? "" : `?path=${encodeURIComponent(path)}`}`);

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
