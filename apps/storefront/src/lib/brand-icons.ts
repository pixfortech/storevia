import type { Metadata } from "next";

// The store's favicon as page metadata (final pass, Phase 2A). The media
// pipeline keeps the cleaned original and WebP renditions (320, 640, 1280
// and 2048 px wide, never wider than the image); the icon links point at the
// smallest rendition, which browsers scale down to a tab icon. A store
// without a favicon sets no icon links, so browsers use their default icon
// (the storefront has no icon of its own).

interface FaviconImage {
  readonly url: string;
  readonly srcSet: string;
}

/** The smallest candidate of a `srcset` ("url 320w, url 640w"), or null. */
export function smallestRendition(srcSet: string): string | null {
  let best: { url: string; width: number } | null = null;
  for (const part of srcSet.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    const width = descriptor?.endsWith("w") ? Number(descriptor.slice(0, -1)) : Number.NaN;
    if (!url || !Number.isFinite(width) || width <= 0) continue;
    if (!best || width < best.width) best = { url, width };
  }
  return best?.url ?? null;
}

/** `icon` and `apple-touch-icon` links for the store's favicon, or nothing. */
export function storeIcons(favicon: FaviconImage | null | undefined): Metadata["icons"] {
  if (!favicon) return undefined;
  const url = smallestRendition(favicon.srcSet) ?? favicon.url;
  const type = url.endsWith(".webp") ? { type: "image/webp" } : {};
  return { icon: [{ url, ...type }], apple: [{ url, ...type }] };
}
