import "server-only";
import { renditionUrls } from "@storevia/media/urls";

/** Browser-ready image sources for an asset's renditions (never the raw upload). */
export interface ImageSource {
  readonly src: string;
  readonly srcSet: string;
  readonly alt: string;
}

/**
 * The product editor's images: every attached asset, in order. One without a
 * servable rendition keeps its place with `src: null` (the editor shows a
 * placeholder) instead of disappearing, so the merchant can still see it,
 * reorder it or remove it.
 */
export function editorImages(
  media: readonly {
    readonly mediaId: string;
    readonly altText: string | null;
    readonly filename: string;
    readonly renditions: unknown;
  }[],
): {
  mediaId: string;
  altText: string | null;
  filename: string;
  src: string | null;
  srcSet: string;
}[] {
  return media.map((m) => {
    const source = imageSource({ renditions: m.renditions, altText: m.altText });
    return {
      mediaId: m.mediaId,
      altText: m.altText,
      filename: m.filename,
      src: source?.src ?? null,
      srcSet: source?.srcSet ?? "",
    };
  });
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
