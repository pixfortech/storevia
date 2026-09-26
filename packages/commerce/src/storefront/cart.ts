import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { TenantTx } from "@storevia/database";
import { storefrontDb, withStorefront } from "@storevia/database/storefront";
import { consumeRateLimitsWith, type RateLimitRule } from "@storevia/security/rate-limit";
import { DomainError, notFound, parseTypeId, toTypeId } from "@storevia/types";
import { money, multiply, sum, toJSON } from "../money";
import { imageDto, type ImageDto, type PriceDto } from "./read";

// Carts (06-storefront.md §6, ADR-0028 §8). The cart is identified by an
// opaque 256-bit token held in a host-only cookie; the database stores only
// its SHA-256. It holds variant ids and quantities, never prices: every view
// is priced on the server from current variant prices. Every mutation
// re-validates the variant against the resolved store, so an id from another
// store, a draft product or a deleted variant is simply "not found".

export const CART_LIMITS = { maxLines: 50, maxQuantity: 99, ttlDays: 30 } as const;

/** `__Host-` cookies must be Secure; plain-HTTP development uses a plain name. */
export function cartCookieName(secure: boolean): string {
  return secure ? "__Host-sv_cart" : "sv_cart";
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newCartToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCartToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CartStore {
  readonly organisationId: string;
  readonly storeId: string;
  readonly currency: string;
}

export interface CartLineView {
  readonly variantId: string;
  readonly productHandle: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly quantity: number;
  readonly unitPrice: PriceDto;
  readonly lineTotal: PriceDto;
  readonly image: ImageDto | null;
  readonly available: boolean;
}

export interface CartView {
  readonly lines: readonly CartLineView[];
  readonly itemCount: number;
  /** Available lines only; checkout (M6) re-prices everything again. */
  readonly subtotal: PriceDto;
  readonly hasUnavailableLines: boolean;
}

export interface CartResult {
  readonly cart: CartView;
  /** Set when the caller must (re)issue the cookie: a new cart was created. */
  readonly newToken: string | null;
}

const RULES: Readonly<Record<"ip" | "cart", RateLimitRule>> = {
  ip: { name: "storefront:cart:ip", limit: 120, windowSeconds: 60 },
  cart: { name: "storefront:cart:cart", limit: 60, windowSeconds: 60 },
};

/** Mutations are limited per client address and per cart (ADR-0028 §8). */
async function rateLimit(
  store: CartStore,
  clientIp: string | null,
  token: string | null,
): Promise<void> {
  const result = await consumeRateLimitsWith(storefrontDb(), [
    [RULES.ip, clientIp ? `${store.storeId}:${clientIp}` : null],
    [RULES.cart, token && TOKEN_RE.test(token) ? hashCartToken(token).slice(0, 32) : null],
  ]);
  if (!result.allowed) {
    throw new DomainError(
      "RATE_LIMITED",
      "Too many cart changes. Please wait a moment and try again.",
    );
  }
}

const emptyCart = (currency: string): CartView => ({
  lines: [],
  itemCount: 0,
  subtotal: { amount: "0", currency },
  hasUnavailableLines: false,
});

async function findCart(tx: TenantTx, token: string | null, lock: boolean): Promise<string | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const hash = hashCartToken(token);
  const rows = lock
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Cart" WHERE "tokenHash" = ${hash} AND status = 'ACTIVE' AND "expiresAt" > now() FOR UPDATE`
    : await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Cart" WHERE "tokenHash" = ${hash} AND status = 'ACTIVE' AND "expiresAt" > now()`;
  return rows[0]?.id ?? null;
}

async function viewCart(tx: TenantTx, cartId: string | null, currency: string): Promise<CartView> {
  if (!cartId) return emptyCart(currency);
  // Lines of products that are no longer sellable are hidden by the storefront role's policies.
  const rows = await tx.$queryRaw<
    {
      variant_id: string;
      quantity: number;
      price: bigint;
      currency: string;
      variant_title: string;
      product_handle: string;
      product_title: string;
      image: { renditions: unknown; alt: string | null } | null;
      available: boolean | null;
    }[]
  >`
    SELECT l."variantId" AS variant_id, l.quantity, v."priceAmount" AS price, v.currency,
      v.title AS variant_title, p.handle AS product_handle, p.title AS product_title,
      (SELECT json_build_object('renditions', m.renditions, 'alt', m."altText") FROM "MediaAsset" m
        WHERE m.id = coalesce(v."imageMediaId", (SELECT pm."mediaAssetId" FROM "ProductMedia" pm
          WHERE pm."productId" = p.id ORDER BY pm.position LIMIT 1))
          AND m.status = 'READY' AND m."deletedAt" IS NULL) AS image,
      av.available
    FROM "CartLine" l
    JOIN "ProductVariant" v ON v.id = l."variantId" AND v."deletedAt" IS NULL
    JOIN "Product" p ON p.id = v."productId" AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL
    LEFT JOIN app_storefront_availability(ARRAY(SELECT "variantId" FROM "CartLine" WHERE "cartId" = ${cartId}::uuid)) av
      ON av.variant_id = l."variantId"
    WHERE l."cartId" = ${cartId}::uuid
    ORDER BY l."createdAt", l.id`;
  const lines = rows.map((row) => {
    const unit = money(row.price, row.currency.trim());
    return {
      variantId: toTypeId("variant", row.variant_id),
      productHandle: row.product_handle,
      productTitle: row.product_title,
      variantTitle: row.variant_title,
      quantity: row.quantity,
      unitPrice: toJSON(unit),
      lineTotal: toJSON(multiply(unit, row.quantity)),
      image: imageDto(row.image, row.product_title),
      available: row.available === true,
    };
  });
  const purchasable = lines.filter((l) => l.available);
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: toJSON(
      sum(
        purchasable.map((l) => money(l.lineTotal.amount, l.lineTotal.currency)),
        currency,
      ),
    ),
    hasUnavailableLines: purchasable.length !== lines.length,
  };
}

/** The cart for a cookie token (an empty cart for a missing, expired or foreign token). */
export async function readCart(store: CartStore, token: string | null): Promise<CartView> {
  return withStorefront(
    store,
    async (tx) => viewCart(tx, await findCart(tx, token, false), store.currency),
    { readOnly: true },
  );
}

const clampQuantity = (value: unknown, min: number): number => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(Math.trunc(n), min), CART_LIMITS.maxQuantity);
};

/** The internal id of a variant that is sellable in this store right now, or NOT_FOUND. */
async function sellableVariant(
  tx: TenantTx,
  variantPublicId: unknown,
): Promise<{ id: string; available: boolean }> {
  const id = typeof variantPublicId === "string" ? parseTypeId("variant", variantPublicId) : null;
  if (!id) throw notFound();
  const rows = await tx.$queryRaw<{ id: string; available: boolean }[]>`
    SELECT v.id, coalesce(av.available, false) AS available
    FROM "ProductVariant" v
    JOIN "Product" p ON p.id = v."productId" AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL
    LEFT JOIN app_storefront_availability(ARRAY[${id}::uuid]) av ON av.variant_id = v.id
    WHERE v.id = ${id}::uuid AND v."deletedAt" IS NULL`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

async function touch(tx: TenantTx, cartId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Cart" SET "expiresAt" = now() + make_interval(days => ${CART_LIMITS.ttlDays}), "updatedAt" = now()
    WHERE id = ${cartId}::uuid`;
}

export interface CartMutationContext {
  readonly store: CartStore;
  /** The cookie value, if any (never trusted beyond its hash). */
  readonly token: string | null;
  /** For rate limiting; null when unknown. */
  readonly clientIp: string | null;
}

/** Adds a variant (quantity is added to an existing line, capped at 99). */
export async function addToCart(
  ctx: CartMutationContext,
  input: { readonly variantId: unknown; readonly quantity?: unknown },
): Promise<CartResult> {
  await rateLimit(ctx.store, ctx.clientIp, ctx.token);
  const quantity = clampQuantity(input.quantity ?? 1, 1);
  return withStorefront(ctx.store, async (tx) => {
    const variant = await sellableVariant(tx, input.variantId);
    if (!variant.available) throw new DomainError("CONFLICT", "This item is sold out.");
    let cartId = await findCart(tx, ctx.token, true);
    let newToken: string | null = null;
    if (!cartId) {
      // A missing, expired or foreign token never becomes a cart: always a fresh token.
      newToken = newCartToken();
      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "Cart" (id, "organisationId", "storeId", "tokenHash", currency, "expiresAt", "updatedAt")
        VALUES (gen_random_uuid(), ${ctx.store.organisationId}::uuid, ${ctx.store.storeId}::uuid,
                ${hashCartToken(newToken)}, ${ctx.store.currency}, now() + make_interval(days => ${CART_LIMITS.ttlDays}), now())
        RETURNING id`;
      cartId = rows[0]?.id ?? null;
      if (!cartId) throw new Error("cart insert returned no row");
    }
    const existing = await tx.$queryRaw<{ n: bigint; has: boolean }[]>`
      SELECT count(*) AS n, bool_or("variantId" = ${variant.id}::uuid) AS has
      FROM "CartLine" WHERE "cartId" = ${cartId}::uuid`;
    const has = existing[0]?.has === true;
    if (!has && Number(existing[0]?.n ?? 0) >= CART_LIMITS.maxLines) {
      throw new DomainError(
        "CONFLICT",
        `A cart can hold at most ${String(CART_LIMITS.maxLines)} different items.`,
      );
    }
    await tx.$executeRaw`
      INSERT INTO "CartLine" (id, "organisationId", "storeId", "cartId", "variantId", quantity, "updatedAt")
      VALUES (gen_random_uuid(), ${ctx.store.organisationId}::uuid, ${ctx.store.storeId}::uuid,
              ${cartId}::uuid, ${variant.id}::uuid, ${quantity}, now())
      ON CONFLICT ("cartId", "variantId") DO UPDATE
        SET quantity = LEAST("CartLine".quantity + EXCLUDED.quantity, ${CART_LIMITS.maxQuantity}), "updatedAt" = now()`;
    await touch(tx, cartId);
    return { cart: await viewCart(tx, cartId, ctx.store.currency), newToken };
  });
}

/** Sets a line's quantity; 0 removes it. A line that isn't in the cart is "not found". */
export async function updateCartLine(
  ctx: CartMutationContext,
  input: { readonly variantId: unknown; readonly quantity: unknown },
): Promise<CartResult> {
  await rateLimit(ctx.store, ctx.clientIp, ctx.token);
  const quantity = clampQuantity(input.quantity, 0);
  const variantId =
    typeof input.variantId === "string" ? parseTypeId("variant", input.variantId) : null;
  return withStorefront(ctx.store, async (tx) => {
    const cartId = await findCart(tx, ctx.token, true);
    if (!cartId || !variantId) throw notFound();
    const changed =
      quantity === 0
        ? await tx.$executeRaw`DELETE FROM "CartLine" WHERE "cartId" = ${cartId}::uuid AND "variantId" = ${variantId}::uuid`
        : await tx.$executeRaw`
            UPDATE "CartLine" SET quantity = ${quantity}, "updatedAt" = now()
            WHERE "cartId" = ${cartId}::uuid AND "variantId" = ${variantId}::uuid`;
    if (changed === 0) throw notFound();
    await touch(tx, cartId);
    return { cart: await viewCart(tx, cartId, ctx.store.currency), newToken: null };
  });
}

/** Removes a line (idempotent). */
export async function removeCartLine(
  ctx: CartMutationContext,
  input: { readonly variantId: unknown },
): Promise<CartResult> {
  try {
    return await updateCartLine(ctx, { variantId: input.variantId, quantity: 0 });
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      return { cart: await readCart(ctx.store, ctx.token), newToken: null };
    }
    throw error;
  }
}

/** The number of items in a cart (0 without a valid token), for the header badge. */
export async function cartItemCount(store: CartStore, token: string | null): Promise<number> {
  if (!token || !TOKEN_RE.test(token)) return 0;
  return (await readCart(store, token)).itemCount;
}
