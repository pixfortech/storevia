// Where media is loaded from and uploaded to, for the Content-Security-Policy
// (ADR-0015, ADR-0027 §9). With local storage everything is same-origin;
// with S3 the CDN (or bucket) serves images and the bucket takes uploads.
// Pure: reads only the environment it is given.

export interface MediaOrigins {
  readonly imageOrigins: readonly string[];
  readonly uploadOrigins: readonly string[];
}

export function mediaOrigins(env: NodeJS.ProcessEnv = process.env): MediaOrigins {
  const production = env["STOREVIA_ENV"] === "production";
  const kind = env["MEDIA_STORAGE"] ?? (production ? "s3" : "local");
  if (kind !== "s3") return { imageOrigins: [], uploadOrigins: [] };
  const images = env["MEDIA_PUBLIC_BASE_URL"];
  let upload: string | undefined;
  try {
    const endpoint = new URL(env["S3_ENDPOINT"] ?? "");
    const bucket = env["S3_BUCKET_MEDIA"] ?? "";
    upload =
      env["S3_FORCE_PATH_STYLE"] === "false" && bucket
        ? `${endpoint.protocol}//${bucket}.${endpoint.host}`
        : endpoint.origin;
  } catch {
    upload = undefined;
  }
  return {
    imageOrigins: images ? [images] : [],
    uploadOrigins: upload ? [upload] : [],
  };
}

/** Served media never runs anything: no scripts, no plugins, a sandbox. */
export const MEDIA_RESPONSE_CSP =
  "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
