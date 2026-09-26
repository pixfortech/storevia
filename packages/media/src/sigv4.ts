import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4 for S3-compatible services (request signing and
// browser POST policies). Small and dependency-free; checked against AWS's
// published example in sigv4.test.ts.

export interface Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
  readonly service?: string;
}

export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac("sha256", key).update(data).digest();

export function amzDate(now: Date): { readonly dateTime: string; readonly date: string } {
  const dateTime = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}/, "");
  return { dateTime, date: dateTime.slice(0, 8) };
}

export function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

/** RFC 3986 encoding as S3 expects it (each path segment separately). */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (ch === "/" && !encodeSlash)) {
      out += ch;
      continue;
    }
    for (const byte of Buffer.from(ch, "utf8")) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

export interface SignableRequest {
  readonly method: string;
  readonly url: URL;
  /** Lower-case names. `host` is added from the URL. */
  readonly headers: Readonly<Record<string, string>>;
  readonly payloadHash: string;
}

/** Returns the headers to send, including x-amz-date, x-amz-content-sha256 and Authorization. */
export function signRequest(
  request: SignableRequest,
  credentials: Credentials,
  now: Date,
): Record<string, string> {
  const service = credentials.service ?? "s3";
  const { dateTime, date } = amzDate(now);
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v])),
    host: request.url.host,
    "x-amz-date": dateTime,
    "x-amz-content-sha256": request.payloadHash,
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${(headers[n] ?? "").trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const query = [...request.url.searchParams.entries()]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const path = decodeURIComponent(request.url.pathname);
  const canonicalRequest = [
    request.method,
    uriEncode(path, false),
    query,
    canonicalHeaders,
    signedHeaders,
    request.payloadHash,
  ].join("\n");
  const scope = `${date}/${credentials.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", dateTime, scope, sha256Hex(canonicalRequest)].join(
    "\n",
  );
  const signature = createHmac(
    "sha256",
    signingKey(credentials.secretAccessKey, date, credentials.region, service),
  )
    .update(stringToSign)
    .digest("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** A signed browser POST policy (S3 "POST Object"), as form fields. */
export function signPostPolicy(
  options: {
    readonly bucket: string;
    readonly key: string;
    readonly maxBytes: number;
    readonly expiresAt: Date;
    readonly now: Date;
  },
  credentials: Credentials,
): Record<string, string> {
  const service = credentials.service ?? "s3";
  const { dateTime, date } = amzDate(options.now);
  const credential = `${credentials.accessKeyId}/${date}/${credentials.region}/${service}/aws4_request`;
  const policy = {
    expiration: options.expiresAt.toISOString(),
    conditions: [
      { bucket: options.bucket },
      { key: options.key },
      // Raw uploads are stored as opaque bytes whatever the browser claims,
      // so nothing uploaded can be served back as HTML or script.
      { "Content-Type": "application/octet-stream" },
      ["content-length-range", 1, options.maxBytes],
      { "x-amz-algorithm": "AWS4-HMAC-SHA256" },
      { "x-amz-credential": credential },
      { "x-amz-date": dateTime },
    ],
  };
  const encoded = Buffer.from(JSON.stringify(policy)).toString("base64");
  const signature = createHmac(
    "sha256",
    signingKey(credentials.secretAccessKey, date, credentials.region, service),
  )
    .update(encoded)
    .digest("hex");
  return {
    key: options.key,
    "Content-Type": "application/octet-stream",
    "x-amz-algorithm": "AWS4-HMAC-SHA256",
    "x-amz-credential": credential,
    "x-amz-date": dateTime,
    policy: encoded,
    "x-amz-signature": signature,
  };
}
