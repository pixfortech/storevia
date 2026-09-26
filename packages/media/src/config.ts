import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { LocalObjectStorage } from "./local";
import { S3ObjectStorage } from "./s3";
import type { ObjectStorage } from "./storage";

// Chooses the storage adapter from the environment. `MEDIA_STORAGE=s3`
// uses any S3-compatible service; `local` keeps objects on disk and is only
// allowed in development and test (it serves media from the dashboard's own
// origin, which production, preview and staging must not do).

let instance: ObjectStorage | undefined;

function required(name: string): string {
  const value = process.env[name];
  if (!value || value === "replace-me") throw new Error(`${name} is required for media storage`);
  return value;
}

const LOCAL_ENVIRONMENTS = new Set(["development", "test"]);

/** An empty variable (`KEY=` in a .env file) counts as unset. */
const setting = (value: string | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : value;

export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorage {
  const localAllowed = LOCAL_ENVIRONMENTS.has(env["STOREVIA_ENV"] ?? "");
  const kind = setting(env["MEDIA_STORAGE"]) ?? (localAllowed ? "local" : "s3");
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
  if (!localAllowed) {
    throw new Error(
      "Local media storage is for development and test only (STOREVIA_ENV). Set MEDIA_STORAGE=s3.",
    );
  }
  const dashboard = (env["DASHBOARD_URL"] ?? "http://app.localhost:3001").replace(/\/+$/, "");
  // A dedicated secret when set (an empty value counts as unset); otherwise
  // one derived from AUTH_SECRET, so local development needs no extra setup.
  // There is no built-in fallback: a known secret would let anyone forge
  // upload tokens.
  const authSecret = setting(env["AUTH_SECRET"]);
  const dedicated = setting(env["MEDIA_UPLOAD_SECRET"]);
  if (!dedicated && !authSecret) {
    throw new Error("Local media storage needs MEDIA_UPLOAD_SECRET or AUTH_SECRET.");
  }
  const secret =
    dedicated ??
    createHmac("sha256", authSecret ?? "")
      .update("storevia-media-upload")
      .digest("hex");
  return new LocalObjectStorage({
    // Development and test only (never in production builds' traced output).
    root: resolve(/*turbopackIgnore: true*/ process.cwd(), env["MEDIA_LOCAL_DIR"] ?? ".media"),
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
