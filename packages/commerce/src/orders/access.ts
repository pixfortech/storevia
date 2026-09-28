import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { TenantTx } from "@storevia/database";
import { createLogger } from "@storevia/observability";

// A guest shopper's link to their order (post-M7). Storevia has no shopper
// accounts, so an order number or email never opens an order: only this
// opaque token does. It is derived from the access row's random id with a
// server secret, so the confirmation email and the thank-you page can show
// it without the database ever holding it; the database stores its SHA-256
// hash, checks expiry and revocation, and binds it to one order of one
// store (app_current_order_access()).
//
//   token = base64url(16-byte row id) + base64url(HMAC-SHA256(secret, id))
//           22 + 43 = 65 characters

const log = createLogger({ component: "order-access" });

/** How long an order link keeps working. */
export const ORDER_ACCESS_DAYS = 180;
const TOKEN_RE = /^[A-Za-z0-9_-]{65}$/;
const LABEL = "storevia:order-access:v1:";

function secret(env: NodeJS.ProcessEnv = process.env): Buffer {
  const configured = env["ORDER_ACCESS_SECRET"];
  if (configured && configured.length >= 32) return Buffer.from(configured);
  // Development and test derive one (from the preview secret when there is
  // one); deployed environments must set their own.
  const stage = env["STOREVIA_ENV"];
  if (stage === "development" || stage === "test") {
    return createHmac("sha256", env["STOREFRONT_PREVIEW_SECRET"] ?? "storevia-development-only")
      .update("storevia:order-access-secret")
      .digest();
  }
  throw new Error("ORDER_ACCESS_SECRET is not set (at least 32 characters)");
}

/** Order links can be issued here (the secret is configured). */
export function orderAccessConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    secret(env);
    return true;
  } catch {
    return false;
  }
}

const mac = (idBytes: Buffer, key: Buffer) =>
  createHmac("sha256", key).update(LABEL).update(idBytes).digest();

const uuidBytes = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex");

/** The token for an access row id. */
export function orderAccessToken(accessId: string, env: NodeJS.ProcessEnv = process.env): string {
  const id = uuidBytes(accessId);
  if (id.length !== 16) throw new Error("orderAccessToken: not a UUID");
  return id.toString("base64url") + mac(id, secret(env)).toString("base64url");
}

export const hashOrderAccessToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/**
 * The hash to look up, for a well-formed token Storevia issued; null for
 * anything else (malformed, forged, or signed with another secret), so a
 * guess never reaches the database.
 */
export function verifiedOrderAccessHash(
  raw: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (typeof raw !== "string" || !TOKEN_RE.test(raw) || !orderAccessConfigured(env)) return null;
  const id = Buffer.from(raw.slice(0, 22), "base64url");
  const given = Buffer.from(raw.slice(22), "base64url");
  if (id.length !== 16 || given.length !== 32) return null;
  const expected = mac(id, secret(env));
  if (!timingSafeEqual(given, expected)) return null;
  return hashOrderAccessToken(raw);
}

/** Where the shopper's order page lives on the storefront. */
export const orderAccessPath = (token: string) => `/orders/view/${token}`;

/**
 * Creates the order's access link in the caller's transaction (the checkout
 * role, as the order is placed). Returns the token, or null when this
 * environment has no ORDER_ACCESS_SECRET: a paid order is never refused for
 * want of a link (the misconfiguration is logged instead).
 */
export async function createOrderAccess(
  tx: TenantTx,
  scope: { readonly organisationId: string; readonly storeId: string },
  orderId: string,
): Promise<string | null> {
  if (!orderAccessConfigured()) {
    log.error("order link not issued: ORDER_ACCESS_SECRET is not set", { orderId });
    return null;
  }
  const id = randomUUID();
  const token = orderAccessToken(id);
  await tx.$executeRaw`
    INSERT INTO "OrderCustomerAccess" (id, "organisationId", "storeId", "orderId", "tokenHash",
      "expiresAt")
    VALUES (${id}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid, ${orderId}::uuid,
      ${hashOrderAccessToken(token)}, now() + ${`${String(ORDER_ACCESS_DAYS)} days`}::interval)`;
  return token;
}

/** The newest live access token of an order the transaction can see, or null. */
export async function currentOrderAccessToken(
  tx: TenantTx,
  orderId: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "OrderCustomerAccess"
    WHERE "orderId" = ${orderId}::uuid AND "revokedAt" IS NULL AND "expiresAt" > now()
    ORDER BY "createdAt" DESC LIMIT 1`;
  return rows[0] && orderAccessConfigured() ? orderAccessToken(rows[0].id) : null;
}
