import "server-only";
import { renditionUrls } from "@storevia/media";

/** Browser-ready image sources for an asset's renditions (never the raw upload). */
export interface ImageSource {
  readonly src: string;
  readonly srcSet: string;
  readonly alt: string;
}

export function imageSource(
  image: { readonly renditions: unknown; readonly altText?: string | null } | null | undefined,
  fallbackAlt = "",
): ImageSource | null {
  if (!image) return null;
  const urls = renditionUrls(image.renditions);
  if (!urls.thumbnailUrl) return null;
  // The second rendition (640 px) reads sharply in cards and editor tiles at 2x.
  const src = urls.renditions[1]?.url ?? urls.thumbnailUrl;
  return { src, srcSet: urls.srcSet, alt: image.altText ?? fallbackAlt };
}
