import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { isStorageKey, parseUploadKey } from "./keys";
import { StorageError, type ObjectInfo, type ObjectStorage, type UploadTarget } from "./storage";

// Local filesystem storage for development and tests (ADR-0027 §9). Uploads
// go to a dashboard route that verifies a short-lived HMAC token bound to
// one key and one size limit; files are served by another route. Refused in
// production by config.ts.

export interface LocalStorageOptions {
  /** Directory holding the objects. */
  readonly root: string;
  /** Absolute URL of the upload route (e.g. http://app.localhost:3001/api/media/upload). */
  readonly uploadUrl: string;
  /** Base URL objects are served from (e.g. http://app.localhost:3001/media). */
  readonly publicBaseUrl: string;
  /** 32+ characters; signs upload tokens. */
  readonly secret: string;
  readonly now?: () => Date;
}

export interface UploadToken {
  readonly key: string;
  readonly maxBytes: number;
  readonly expires: number;
  readonly signature: string;
}

export class LocalObjectStorage implements ObjectStorage {
  readonly kind = "local" as const;
  private readonly root: string;

  constructor(private readonly options: LocalStorageOptions) {
    if (options.secret.length < 32)
      throw new Error("local media storage needs a secret of 32+ characters");
    this.root = resolve(options.root);
  }

  /** The file for a key, guaranteed to be inside the root. */
  private path(key: string): string {
    if (!isStorageKey(key)) throw new StorageError("Invalid object key.", "INVALID_KEY");
    const full = resolve(this.root, ...key.split("/"));
    if (!full.startsWith(this.root + sep))
      throw new StorageError("Invalid object key.", "INVALID_KEY");
    return full;
  }

  private sign(key: string, maxBytes: number, expires: number): string {
    return createHmac("sha256", this.options.secret)
      .update(`storevia-media-upload\n${key}\n${String(maxBytes)}\n${String(expires)}`)
      .digest("base64url");
  }

  createUploadTarget(
    key: string,
    options: { maxBytes: number; expiresInSeconds: number },
  ): Promise<UploadTarget> {
    // Invalid keys reject the promise rather than throwing synchronously.
    return Promise.resolve().then(() => this.uploadTarget(key, options));
  }

  private uploadTarget(
    key: string,
    options: { maxBytes: number; expiresInSeconds: number },
  ): UploadTarget {
    if (!parseUploadKey(key))
      throw new StorageError("Uploads go to upload keys only.", "INVALID_KEY");
    const now = (this.options.now ?? (() => new Date()))();
    const expires = Math.floor(now.getTime() / 1000) + options.expiresInSeconds;
    return {
      url: this.options.uploadUrl,
      fields: {
        key,
        maxBytes: String(options.maxBytes),
        expires: String(expires),
        signature: this.sign(key, options.maxBytes, expires),
      },
      maxBytes: options.maxBytes,
      expiresAt: new Date(expires * 1000),
    };
  }

  /** Checks an upload token from the upload route. Returns the verified token or null. */
  verifyUploadToken(fields: Record<string, unknown>): UploadToken | null {
    const { key, maxBytes, expires, signature } = fields;
    if (
      typeof key !== "string" ||
      typeof maxBytes !== "string" ||
      typeof expires !== "string" ||
      typeof signature !== "string"
    ) {
      return null;
    }
    if (!parseUploadKey(key)) return null;
    const max = Number(maxBytes);
    const exp = Number(expires);
    if (!Number.isSafeInteger(max) || max <= 0 || !Number.isSafeInteger(exp)) return null;
    const now = Math.floor((this.options.now ?? (() => new Date()))().getTime() / 1000);
    if (exp < now) return null;
    const expected = Buffer.from(this.sign(key, max, exp));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return { key, maxBytes: max, expires: exp, signature };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const info = await stat(this.path(key));
      return info.isFile() ? { size: info.size, contentType: null } : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async read(key: string, options: { maxBytes: number }): Promise<Uint8Array> {
    const info = await this.head(key);
    if (!info) throw new StorageError("Object not found.", "NOT_FOUND");
    if (info.size > options.maxBytes) throw new StorageError("Object is too large.", "TOO_LARGE");
    return new Uint8Array(await readFile(this.path(key)));
  }

  async write(key: string, body: Uint8Array): Promise<void> {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    // Write then rename, so a reader never sees half a file.
    const temp = `${target}.${String(process.pid)}.${String(Date.now())}.tmp`;
    await writeFile(temp, body, { flag: "wx" });
    await rename(temp, target);
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.options.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  /** Reads a servable object for the serving route (null when missing). */
  async readForServing(key: string, maxBytes: number): Promise<Uint8Array | null> {
    try {
      return await this.read(key, { maxBytes });
    } catch (error) {
      if (error instanceof StorageError && error.code === "NOT_FOUND") return null;
      throw error;
    }
  }
}
