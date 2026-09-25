// Object storage behind one interface (ADR-0015, ADR-0027 §9). Commerce and
// the dashboard only ever see ObjectStorage; which adapter runs is decided
// by configuration (config.ts). Raw uploads never pass through the database.

export interface UploadTarget {
  /** Where the browser sends a multipart POST: fields first, then `file`. */
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

export interface ObjectInfo {
  readonly size: number;
  readonly contentType: string | null;
}

export interface ObjectStorage {
  readonly kind: "local" | "s3";
  /** A short-lived, single-key upload target limited to `maxBytes`. */
  createUploadTarget(
    key: string,
    options: { readonly maxBytes: number; readonly expiresInSeconds: number },
  ): Promise<UploadTarget>;
  head(key: string): Promise<ObjectInfo | null>;
  /** Reads a whole object, refusing anything larger than `maxBytes`. */
  read(key: string, options: { readonly maxBytes: number }): Promise<Uint8Array>;
  write(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** The URL browsers load a servable object from. */
  publicUrl(key: string): string;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "TOO_LARGE" | "INVALID_KEY" | "UPSTREAM",
  ) {
    super(message);
    this.name = "StorageError";
  }
}
