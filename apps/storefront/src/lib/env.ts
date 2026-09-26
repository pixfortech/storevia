import "server-only";
import { createHmac } from "node:crypto";

// Storefront configuration (ADR-0028 §11, §9). Secrets are read on use and
// never logged.

function secret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to at least 32 random characters`);
  }
  return value;
}

/** Shared with the dashboard, which issues preview links. */
export const previewSecret = () => secret("STOREFRONT_PREVIEW_SECRET");

/** Shared with the worker, which posts cache invalidations. */
export const revalidateSecret = () => secret("STOREFRONT_REVALIDATE_SECRET");

/**
 * Key for the header the proxy passes to pages (the resolved store). Derived
 * from the preview secret with its own label, so it signs nothing else.
 */
export function internalHeaderKey(): Buffer {
  return createHmac("sha256", previewSecret()).update("storevia:internal-store-header:v1").digest();
}

/** Served over HTTPS (Secure cookies, HSTS, upgrade-insecure-requests). */
export const isSecure = () => process.env["STOREFRONT_PROTOCOL"] !== "http";
