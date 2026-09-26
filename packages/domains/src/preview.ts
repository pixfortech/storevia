// Signed preview tokens (06-storefront.md §8, ADR-0028 §11). The dashboard
// issues them for users with design.edit; the storefront accepts one only on
// the store it names. HMAC-SHA256 over a small JSON payload with a key
// derived from STOREFRONT_PREVIEW_SECRET (domain-separated, so the same
// secret can never sign anything else); 15 minutes at most.
import { createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_TTL_SECONDS = 15 * 60;

export interface PreviewClaims {
  readonly v: 1;
  /** The store's internal id: a token for one store is refused on every other. */
  readonly storeId: string;
  /** M4 previews the whole store; M5 adds "page-version", M7 "store-theme". */
  readonly scope: "store";
  /** Expiry, seconds since the epoch. */
  readonly exp: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function key(secret: string): Buffer {
  if (secret.length < 32)
    throw new Error("STOREFRONT_PREVIEW_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update("storevia:preview-token:v1").digest();
}

const sign = (secret: string, payload: string) =>
  createHmac("sha256", key(secret)).update(payload).digest("base64url");

export function signPreviewToken(
  storeId: string,
  secret: string,
  now = Date.now(),
  ttlSeconds = PREVIEW_TTL_SECONDS,
): string {
  if (!UUID_RE.test(storeId)) throw new Error("signPreviewToken: not a store id");
  const claims: PreviewClaims = {
    v: 1,
    storeId,
    scope: "store",
    exp: Math.floor(now / 1000) + Math.min(ttlSeconds, PREVIEW_TTL_SECONDS),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/** The claims when the token is authentic, unexpired and for `storeId`; otherwise null. */
export function verifyPreviewToken(
  token: string | null | undefined,
  storeId: string,
  secret: string,
  now = Date.now(),
): PreviewClaims | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const c = claims as Partial<PreviewClaims>;
  if (c.v !== 1 || c.scope !== "store" || c.storeId !== storeId || typeof c.exp !== "number")
    return null;
  const nowSeconds = Math.floor(now / 1000);
  if (c.exp <= nowSeconds || c.exp > nowSeconds + PREVIEW_TTL_SECONDS) return null;
  return { v: 1, storeId: c.storeId, scope: "store", exp: c.exp };
}
