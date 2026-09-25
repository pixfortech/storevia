import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { RENDITION_WIDTHS } from "./keys";
import { MEDIA_LIMITS, sniffImage, SNIFF_MESSAGES, type AcceptedImageType } from "./sniff";

// Image processing (ADR-0027 §9): decode with limits, apply the EXIF
// orientation, strip every piece of metadata (including GPS), re-encode the
// original and generate WebP renditions. Nothing the uploader wrote into
// the file survives except pixels.

export class MediaRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaRejectedError";
  }
}

export interface ProcessedImage {
  readonly mimeType: AcceptedImageType;
  readonly extension: "jpg" | "png" | "webp" | "gif" | "avif";
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly original: Uint8Array;
  /** `target` is the standard width in the object name (w320.webp…); width/height are actual. */
  readonly renditions: readonly {
    readonly target: number;
    readonly width: number;
    readonly height: number;
    readonly data: Uint8Array;
  }[];
}

sharp.cache(false);
sharp.concurrency(1);

export async function processImage(input: Uint8Array): Promise<ProcessedImage> {
  if (input.byteLength > MEDIA_LIMITS.maxBytes)
    throw new MediaRejectedError("Images can be up to 20 MB.");
  const sniffed = sniffImage(input.subarray(0, 4096));
  if (!sniffed.ok) throw new MediaRejectedError(SNIFF_MESSAGES[sniffed.reason]);

  const animated = sniffed.mimeType === "image/gif" || sniffed.mimeType === "image/webp";
  const base = () =>
    sharp(input, {
      limitInputPixels: MEDIA_LIMITS.maxPixels,
      failOn: "error",
      animated,
      sequentialRead: true,
    });

  let meta: Metadata;
  try {
    meta = await base().metadata();
  } catch {
    throw new MediaRejectedError("That image couldn't be read. It may be damaged.");
  }
  // The decoder must agree with the sniffed type (a PNG header on a JPEG body is refused).
  const formats: Record<AcceptedImageType, readonly string[]> = {
    "image/jpeg": ["jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "image/avif": ["heif", "avif"],
  };
  if (!formats[sniffed.mimeType].includes(meta.format)) {
    throw new MediaRejectedError(SNIFF_MESSAGES.unknown);
  }
  const width = meta.width;
  const frameHeight = meta.pageHeight ?? meta.height;
  if (!width || !frameHeight) throw new MediaRejectedError("That image has no size.");
  const pages = meta.pages ?? 1;
  if (width * frameHeight * pages > MEDIA_LIMITS.maxPixels) {
    throw new MediaRejectedError("That image is too large (over 40 megapixels).");
  }

  try {
    // rotate() applies the EXIF orientation; sharp drops all metadata on
    // output unless asked to keep it, so none is kept.
    const oriented = () => base().rotate();
    const original = await (() => {
      switch (sniffed.mimeType) {
        case "image/jpeg":
          return oriented().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        case "image/png":
          return oriented().png({ compressionLevel: 9 }).toBuffer();
        case "image/webp":
          return oriented().webp({ quality: 90 }).toBuffer();
        case "image/gif":
          return oriented().gif().toBuffer();
        case "image/avif":
          return oriented().avif({ quality: 60 }).toBuffer();
      }
    })();
    const orientedMeta = await sharp(original, {
      animated,
      limitInputPixels: MEDIA_LIMITS.maxPixels,
    }).metadata();
    const outWidth = orientedMeta.width;
    const outHeight = orientedMeta.pageHeight ?? orientedMeta.height;

    // One WebP per standard width up to the image's own width (the last one
    // is the image at its native size); a small image gets just the first.
    const renditions: { target: number; width: number; height: number; data: Uint8Array }[] = [];
    for (const target of RENDITION_WIDTHS) {
      const out = await sharp(original, { animated, limitInputPixels: MEDIA_LIMITS.maxPixels })
        .resize({ width: Math.min(target, outWidth), withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      renditions.push({
        target,
        width: out.info.width,
        height: out.info.pageHeight ?? out.info.height,
        data: new Uint8Array(out.data),
      });
      if (target >= outWidth) break;
    }
    return {
      mimeType: sniffed.mimeType,
      extension: sniffed.extension,
      width: outWidth,
      height: outHeight,
      sha256: createHash("sha256").update(input).digest("hex"),
      original: new Uint8Array(original),
      renditions,
    };
  } catch (error) {
    if (error instanceof MediaRejectedError) throw error;
    throw new MediaRejectedError("That image couldn't be processed. It may be damaged.");
  }
}
