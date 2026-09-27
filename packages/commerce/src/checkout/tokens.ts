import { createHash, randomBytes } from "node:crypto";

// Checkout tokens (ADR-0031 §1): an opaque 256-bit value in a host-only
// cookie; the database stores only its SHA-256. Holding the token is what
// lets a shopper see and change one checkout (and its order afterwards).

export const CHECKOUT_LIMITS = {
  /** A checkout expires this long after its last change. */
  ttlMinutes: 60,
  /** One payment attempt's window at the provider. */
  paymentTtlMinutes: 15,
  /** Expired checkouts keep contact details this long, then they are purged. */
  retainExpiredDays: 30,
} as const;

/** `__Host-` cookies must be Secure; plain-HTTP development uses a plain name. */
export function checkoutCookieName(secure: boolean): string {
  return secure ? "__Host-sv_checkout" : "sv_checkout";
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newCheckoutToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isCheckoutToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export function hashCheckoutToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
