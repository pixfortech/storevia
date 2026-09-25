import { parseObjectKey } from "./keys";
import {
  EMPTY_SHA256,
  sha256Hex,
  signPostPolicy,
  signRequest,
  uriEncode,
  type Credentials,
} from "./sigv4";
import { StorageError, type ObjectInfo, type ObjectStorage, type UploadTarget } from "./storage";

// Any S3-compatible service (AWS S3, R2, MinIO, GCS interop) through signed
// requests. Browsers upload straight to the bucket with a POST policy that
// pins the key and a size range; the app never proxies upload bytes in
// production (ADR-0015).

export interface S3StorageOptions {
  /** e.g. https://s3.eu-west-1.amazonaws.com or http://localhost:9000 */
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Where objects are served from (CDN or the user-content domain). */
  readonly publicBaseUrl: string;
  /** Path-style addressing (MinIO and most self-hosted services). */
  readonly forcePathStyle?: boolean;
  readonly now?: () => Date;
  readonly fetch?: typeof fetch;
}

export class S3ObjectStorage implements ObjectStorage {
  readonly kind = "s3" as const;
  private readonly credentials: Credentials;

  constructor(private readonly options: S3StorageOptions) {
    this.credentials = {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region,
    };
  }

  private now(): Date {
    return (this.options.now ?? (() => new Date()))();
  }

  private bucketUrl(): URL {
    const endpoint = new URL(this.options.endpoint);
    if (this.options.forcePathStyle) {
      return new URL(
        `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, "")}/${uriEncode(this.options.bucket)}/`,
      );
    }
    return new URL(
      `${endpoint.protocol}//${this.options.bucket}.${endpoint.host}${endpoint.pathname.replace(/\/+$/, "")}/`,
    );
  }

  private objectUrl(key: string): URL {
    if (!parseObjectKey(key)) throw new StorageError("Invalid object key.", "INVALID_KEY");
    return new URL(uriEncode(key, false), this.bucketUrl());
  }

  private async send(
    method: string,
    key: string,
    options: { readonly body?: Uint8Array; readonly headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = this.objectUrl(key);
    const payloadHash = options.body ? sha256Hex(options.body) : EMPTY_SHA256;
    const headers = signRequest(
      { method, url, headers: options.headers ?? {}, payloadHash },
      this.credentials,
      this.now(),
    );
    delete headers["host"];
    const doFetch = this.options.fetch ?? fetch;
    return doFetch(url, {
      method,
      headers,
      ...(options.body ? { body: new Uint8Array(options.body) } : {}),
      redirect: "error",
    });
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
    if (!parseObjectKey(key)) throw new StorageError("Invalid object key.", "INVALID_KEY");
    const now = this.now();
    const expiresAt = new Date(now.getTime() + options.expiresInSeconds * 1000);
    return {
      url: this.bucketUrl().toString(),
      fields: signPostPolicy(
        { bucket: this.options.bucket, key, maxBytes: options.maxBytes, expiresAt, now },
        this.credentials,
      ),
      maxBytes: options.maxBytes,
      expiresAt,
    };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const response = await this.send("HEAD", key);
    if (response.status === 404) return null;
    if (!response.ok)
      throw new StorageError(`Storage HEAD failed (${String(response.status)}).`, "UPSTREAM");
    const size = Number(response.headers.get("content-length") ?? "NaN");
    if (!Number.isSafeInteger(size))
      throw new StorageError("Storage returned no size.", "UPSTREAM");
    return { size, contentType: response.headers.get("content-type") };
  }

  async read(key: string, options: { maxBytes: number }): Promise<Uint8Array> {
    const response = await this.send("GET", key);
    if (response.status === 404) throw new StorageError("Object not found.", "NOT_FOUND");
    if (!response.ok || !response.body) {
      throw new StorageError(`Storage GET failed (${String(response.status)}).`, "UPSTREAM");
    }
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > options.maxBytes) {
      await response.body.cancel();
      throw new StorageError("Object is too large.", "TOO_LARGE");
    }
    // Count while reading: a missing or wrong Content-Length can't smuggle more.
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxBytes) {
        await reader.cancel();
        throw new StorageError("Object is too large.", "TOO_LARGE");
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  async write(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const response = await this.send("PUT", key, {
      body,
      headers: {
        "content-type": contentType,
        "content-length": String(body.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
    if (!response.ok)
      throw new StorageError(`Storage PUT failed (${String(response.status)}).`, "UPSTREAM");
  }

  async delete(key: string): Promise<void> {
    const response = await this.send("DELETE", key);
    if (!response.ok && response.status !== 404) {
      throw new StorageError(`Storage DELETE failed (${String(response.status)}).`, "UPSTREAM");
    }
  }

  publicUrl(key: string): string {
    return `${this.options.publicBaseUrl.replace(/\/+$/, "")}/${uriEncode(key, false)}`;
  }
}
