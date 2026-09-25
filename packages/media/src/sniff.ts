// Content sniffing (ADR-0027 §9). The file's type is decided by its bytes,
// never by its name or the type the browser declared. Pure and client-safe.

export type AcceptedImageType =
  "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";

export type SniffResult =
  | {
      readonly ok: true;
      readonly mimeType: AcceptedImageType;
      readonly extension: "jpg" | "png" | "webp" | "gif" | "avif";
    }
  | { readonly ok: false; readonly reason: "svg" | "heic" | "unknown" | "empty" };

export const ACCEPTED_TYPES: readonly AcceptedImageType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

export const MEDIA_LIMITS = {
  /** Largest upload accepted (bytes). */
  maxBytes: 20 * 1024 * 1024,
  /** Largest decoded image (pixels), against decompression bombs. */
  maxPixels: 40_000_000,
  /** Files a person can pick for one upload batch. */
  maxBatch: 20,
} as const;

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function isoBrands(bytes: Uint8Array): string[] {
  // ISO-BMFF: [size:4]["ftyp"][major:4][minor:4][compatible brands:4*n]
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return [];
  const size =
    ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
  const end = Math.min(Math.max(size, 16), bytes.length, 256);
  const brands = [ascii(bytes, 8, 4)];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(bytes, i, 4));
  return brands;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 1024));
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // byte-order mark
  const head = text.trimStart().toLowerCase();
  return (
    head.startsWith("<svg") ||
    (head.startsWith("<?xml") && head.includes("<svg")) ||
    head.startsWith("<!doctype svg")
  );
}

/** Identifies an image from its first bytes (4 KiB is plenty). */
export function sniffImage(bytes: Uint8Array): SniffResult {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff]))
    return { ok: true, mimeType: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, mimeType: "image/png", extension: "png" };
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return { ok: true, mimeType: "image/gif", extension: "gif" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { ok: true, mimeType: "image/webp", extension: "webp" };
  }
  const brands = isoBrands(bytes);
  if (brands.includes("avif") || brands.includes("avis")) {
    return { ok: true, mimeType: "image/avif", extension: "avif" };
  }
  if (brands.some((b) => ["heic", "heix", "hevc", "heim", "heis", "mif1"].includes(b))) {
    return { ok: false, reason: "heic" };
  }
  if (looksLikeSvg(bytes)) return { ok: false, reason: "svg" };
  return { ok: false, reason: "unknown" };
}

export const SNIFF_MESSAGES: Record<Exclude<SniffResult, { ok: true }>["reason"], string> = {
  svg: "SVG files can't be used as product media. Upload a JPEG, PNG, WebP, GIF or AVIF image.",
  heic: "HEIC photos aren't supported yet. Export the photo as JPEG and upload that.",
  unknown: "That file isn't a supported image. Upload a JPEG, PNG, WebP, GIF or AVIF image.",
  empty: "That file is empty.",
};

/** Cheap pre-checks on what the browser says, before anything is uploaded. Never a substitute for sniffing. */
export function precheckUpload(input: {
  readonly filename: string;
  readonly size: number;
}): string | null {
  if (!Number.isInteger(input.size) || input.size <= 0) return "That file is empty.";
  if (input.size > MEDIA_LIMITS.maxBytes) {
    return `Images can be up to ${String(MEDIA_LIMITS.maxBytes / 1024 / 1024)} MB.`;
  }
  if (/\.svgz?$/i.test(input.filename)) return SNIFF_MESSAGES.svg;
  return null;
}
