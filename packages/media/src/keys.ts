// Object keys (ADR-0015, ADR-0027 §9). Keys are generated on the server from
// ids, never from filenames or user input, and every key is checked against
// this grammar before it reaches a storage adapter, so a key can't escape
// its tenant's prefix or the storage root ("..", "/", encoded tricks).

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Files kept for an asset: the cleaned original and WebP renditions. */
export const OBJECT_NAME_RE =
  /^(?:original\.(?:jpg|png|webp|gif|avif)|w(?:320|640|1280|2048)\.webp)$/;

export const OBJECT_KEY_RE = new RegExp(
  `^(${UUID})/(${UUID})/(${UUID})/(original\\.(?:jpg|png|webp|gif|avif)|w(?:320|640|1280|2048)\\.webp)$`,
);

/**
 * Raw uploads live under their own top-level prefix, apart from the served
 * objects: a CDN or bucket policy never serves `uploads/`, and a storage
 * lifecycle rule expires whatever is left there (docs/deployment).
 */
export const UPLOAD_KEY_RE = new RegExp(`^uploads/(${UUID})/(${UUID})/(${UUID})$`);

/** Names that may be served to browsers: never the raw upload. */
export const SERVABLE_NAME_RE =
  /^(?:original\.(?:jpg|png|webp|gif|avif)|w(?:320|640|1280|2048)\.webp)$/;

export interface ParsedKey {
  readonly organisationId: string;
  readonly storeId: string;
  readonly mediaId: string;
  readonly name: string;
}

export function parseObjectKey(key: string): ParsedKey | null {
  const match = OBJECT_KEY_RE.exec(key);
  if (!match) return null;
  const [, organisationId = "", storeId = "", mediaId = "", name = ""] = match;
  return { organisationId, storeId, mediaId, name };
}

export interface MediaOwner {
  readonly organisationId: string;
  readonly storeId: string;
  readonly mediaId: string;
}

export function parseUploadKey(key: string): MediaOwner | null {
  const match = UPLOAD_KEY_RE.exec(key);
  if (!match) return null;
  const [, organisationId = "", storeId = "", mediaId = ""] = match;
  return { organisationId, storeId, mediaId };
}

/** Where the browser uploads an asset's raw bytes. Never served. */
export function uploadKey(owner: MediaOwner): string {
  const key = `uploads/${owner.organisationId}/${owner.storeId}/${owner.mediaId}`;
  if (!parseUploadKey(key)) throw new Error("invalid upload key");
  return key;
}

/** Any key a storage adapter may touch: a stored object or a raw upload. */
export function isStorageKey(key: string): boolean {
  return parseObjectKey(key) !== null || parseUploadKey(key) !== null;
}

export function isServableKey(key: string): boolean {
  const parsed = parseObjectKey(key);
  return parsed !== null && SERVABLE_NAME_RE.test(parsed.name);
}

export function objectKey(owner: MediaOwner, name: string): string {
  const key = `${owner.organisationId}/${owner.storeId}/${owner.mediaId}/${name}`;
  if (!parseObjectKey(key)) throw new Error("invalid object key");
  return key;
}

export const RENDITION_WIDTHS = [320, 640, 1280, 2048] as const;

export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** The content type a stored object is served with, from its (server-chosen) name. */
export function contentTypeForKey(key: string): string | null {
  const parsed = parseObjectKey(key);
  if (!parsed || !SERVABLE_NAME_RE.test(parsed.name)) return null;
  const ext = parsed.name.slice(parsed.name.lastIndexOf(".") + 1);
  return CONTENT_TYPES[ext] ?? null;
}
