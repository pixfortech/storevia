import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { LocalObjectStorage } from "./local";
import { S3ObjectStorage } from "./s3";
import type { ObjectStorage } from "./storage";

// Chooses the storage adapter from the environment. `MEDIA_STORAGE=s3`
// uses any S3-compatible service; `local` (the default outside production)
// keeps objects on disk. The local adapter refuses to start in production.

let instance: ObjectStorage | undefined;

function required(name: string): string {
  const value = process.env[name];
  if (!value || value === "replace-me") throw new Error(`${name} is required for media storage`);
  return value;
}

export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorage {
  const production = env["STOREVIA_ENV"] === "production";
  const kind = env["MEDIA_STORAGE"] ?? (production ? "s3" : "local");
  if (kind === "s3") {
    return new S3ObjectStorage({
      endpoint: required("S3_ENDPOINT"),
      region: env["S3_REGION"] ?? "us-east-1",
      bucket: required("S3_BUCKET_MEDIA"),
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      publicBaseUrl: required("MEDIA_PUBLIC_BASE_URL"),
      forcePathStyle: env["S3_FORCE_PATH_STYLE"] !== "false",
    });
  }
  if (kind !== "local") throw new Error(`MEDIA_STORAGE must be "local" or "s3", not "${kind}"`);
  if (production)
    throw new Error("Local media storage can't be used in production. Set MEDIA_STORAGE=s3.");
  const dashboard = (env["DASHBOARD_URL"] ?? "http://app.localhost:3001").replace(/\/+$/, "");
  // A dedicated secret when set; otherwise one derived from AUTH_SECRET, so
  // local development needs no extra setup. Never used in production.
  const secret =
    env["MEDIA_UPLOAD_SECRET"] ??
    createHmac("sha256", env["AUTH_SECRET"] ?? "storevia-local-development-only")
      .update("storevia-media-upload")
      .digest("hex");
  return new LocalObjectStorage({
    root: resolve(process.cwd(), env["MEDIA_LOCAL_DIR"] ?? ".media"),
    uploadUrl: `${dashboard}/api/media/upload`,
    publicBaseUrl: `${dashboard}/media`,
    secret,
  });
}

/** The process-wide storage adapter. */
export function mediaStorage(): ObjectStorage {
  instance ??= storageFromEnv();
  return instance;
}

/** Tests only: replace the adapter. */
export function setMediaStorageForTests(storage: ObjectStorage | undefined): void {
  instance = storage;
}
