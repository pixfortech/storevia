import "server-only";
import { mediaStorage } from "./config";
import { isServableKey } from "./keys";
import type { ObjectStorage } from "./storage";

// Public URLs for processed media (ADR-0027 §9). No database access, so the
// storefront can build image URLs without the app role's modules.

export interface MediaRenditionView {
  readonly width: number;
  readonly height: number;
  readonly url: string;
}

export interface StoredRendition {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly bytes: number;
}

export function parseRenditions(value: unknown): StoredRendition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r: unknown) => {
    if (typeof r !== "object" || r === null) return [];
    const { key, width, height, format, bytes } = r as Record<string, unknown>;
    return typeof key === "string" && typeof width === "number" && typeof height === "number"
      ? [
          {
            key,
            width,
            height,
            format: typeof format === "string" ? format : "webp",
            bytes: typeof bytes === "number" ? bytes : 0,
          },
        ]
      : [];
  });
}

/**
 * Browser URLs for an asset's renditions. Only servable asset keys become
 * URLs (never the raw upload, never another shape of key), even if the
 * stored renditions were tampered with.
 */
export function renditionUrls(
  renditions: unknown,
  storage: ObjectStorage = mediaStorage(),
): {
  readonly thumbnailUrl: string | null;
  readonly srcSet: string;
  readonly renditions: readonly MediaRenditionView[];
} {
  const list = parseRenditions(renditions)
    .filter((r) => isServableKey(r.key) && r.width > 0 && r.height > 0)
    .sort((a, b) => a.width - b.width)
    .map((r) => ({ width: r.width, height: r.height, url: storage.publicUrl(r.key) }));
  return {
    thumbnailUrl: list[0]?.url ?? null,
    srcSet: list.map((r) => `${r.url} ${String(r.width)}w`).join(", "),
    renditions: list,
  };
}
