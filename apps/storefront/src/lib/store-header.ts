// The resolved store travels from the proxy to pages in one signed header
// (ADR-0028 §4). Pages and actions trust only a header whose HMAC verifies,
// so a client can never pick a store by sending the header itself (the proxy
// also drops any incoming x-sv-* header before setting its own).
import { createHmac, timingSafeEqual } from "node:crypto";

export const STORE_HEADER = "x-sv-store";

export type Availability = "live" | "coming-soon" | "unavailable";

export interface StoreRequestContext {
  readonly storeId: string;
  readonly organisationId: string;
  readonly name: string;
  readonly currency: string;
  readonly locale: string;
  readonly country: string;
  /** The host this request came in on (normalised). */
  readonly hostname: string;
  /** Canonical host for URLs (the primary, or this host when there is none). */
  readonly canonicalHostname: string;
  readonly availability: Availability;
  /** A valid preview token was presented for this store. */
  readonly preview: boolean;
  /** Seconds since the epoch; the header is only good for the request it was made for. */
  readonly iat: number;
}

const MAX_AGE_SECONDS = 60;

export function signStoreHeader(ctx: StoreRequestContext, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify(ctx)).toString("base64url");
  const mac = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyStoreHeader(
  value: string | null | undefined,
  key: Buffer,
  now = Date.now(),
): StoreRequestContext | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  const [payload, mac, extra] = value.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(createHmac("sha256", key).update(payload).digest("base64url"));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const ctx = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as StoreRequestContext;
    const age = Math.floor(now / 1000) - ctx.iat;
    return age >= -5 && age <= MAX_AGE_SECONDS ? ctx : null;
  } catch {
    return null;
  }
}
