import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { TenantTx } from "@storevia/database";
import { storefrontDb, withStorefront } from "@storevia/database/storefront";
import { consumeRateLimitsWith, type RateLimitRule } from "@storevia/security/rate-limit";
import { DomainError, notFound, parseTypeId, toTypeId, validationFailed } from "@storevia/types";
import { money, multiply, sum, toJSON } from "../money";
import { imageDto, type ImageDto, type PriceDto } from "./read";

// Carts (06-storefront.md §6, ADR-0028 §8). The cart is identified by an
// opaque 256-bit token held in a host-only cookie; the database stores only
// its SHA-256. It holds variant ids and quantities, never prices: every view
// is priced on the server from current variant prices. Every mutation
// re-validates the variant against the resolved store, so an id from another
// store, a draft product or a deleted variant is simply "not found".
//
// Quantities are never clamped: more than a line may hold (99), or more than
// can be supplied, is refused with the reason and the line keeps its
// previous quantity. What can be supplied is app_variant_stock(), the same
// rule checkout reserves by (one online-fulfilling location holds the whole
// line); it is a guard, not a reservation, so checkout still has the last word.

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

/**
 * How a line stands against stock:
 * - `in_stock`: stock doesn't limit it (untracked, oversellable, or 100+);
 * - `limited`: tracked stock allows `maxQuantity` in all (shown as "Only N available");
 * - `insufficient`: more is in the cart than can be supplied;
 * - `sold_out`: none can be supplied.
 * Only `in_stock` and `limited` lines can be bought.
 */
export type CartLineStock = "in_stock" | "limited" | "insufficient" | "sold_out";

export interface CartLineView {
  readonly variantId: string;
  readonly productHandle: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly quantity: number;
  readonly unitPrice: PriceDto;
  readonly lineTotal: PriceDto;
  readonly image: ImageDto | null;
  /** Whether the line can be bought at its quantity. */
  readonly available: boolean;
  readonly stock: CartLineStock;
  /** The most this line may hold (stock-limited, and never above the cart's 99). */
  readonly maxQuantity: number;
}

export interface CartView {
  readonly lines: readonly CartLineView[];
  readonly itemCount: number;
  /** Available lines only; checkout (M6) re-prices everything again. */
  readonly subtotal: PriceDto;
  /** Some line can't be bought as it is: it must be changed or removed before checkout. */
  readonly hasUnavailableLines: boolean;
}

/**
 * A quantity the cart refuses: over the cart's per-line limit, more than can
 * be supplied, or a sold-out item. `available` is how many can be had in all
 * (for "Only 2 are available."), when stock is the reason.
 */
export class CartQuantityError extends DomainError {
  constructor(
    readonly reason: "limit" | "stock" | "sold_out",
    message: string,
    readonly available: number | null = null,
  ) {
    super("CONFLICT", message);
  }
}

const onlyAvailable = (n: number) => `Only ${String(n)} ${n === 1 ? "is" : "are"} available.`;

/** The stock ceiling from app_variant_stock (null: stock doesn't limit the variant). */
function lineStock(stockMax: number | null, quantity: number): CartLineStock {
  if (stockMax === null || stockMax > CART_LIMITS.maxQuantity) return "in_stock";
  if (stockMax === 0) return "sold_out";
  return quantity > stockMax ? "insufficient" : "limited";
}

const maxQuantityOf = (stockMax: number | null) =>
  stockMax === null ? CART_LIMITS.maxQuantity : Math.min(stockMax, CART_LIMITS.maxQuantity);

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
      max_quantity: number | null;
    }[]
  >`
    SELECT l."variantId" AS variant_id, l.quantity, v."priceAmount" AS price, v.currency,
      v.title AS variant_title, p.handle AS product_handle, p.title AS product_title,
      (SELECT json_build_object('renditions', m.renditions, 'alt', m."altText") FROM "MediaAsset" m
        WHERE m.id = coalesce(v."imageMediaId", (SELECT pm."mediaAssetId" FROM "ProductMedia" pm
          WHERE pm."productId" = p.id ORDER BY pm.position LIMIT 1))
          AND m.status = 'READY' AND m."deletedAt" IS NULL) AS image,
      st.max_quantity
    FROM "CartLine" l
    JOIN "ProductVariant" v ON v.id = l."variantId" AND v."deletedAt" IS NULL
    JOIN "Product" p ON p.id = v."productId" AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL
    JOIN app_variant_stock(ARRAY(SELECT "variantId" FROM "CartLine" WHERE "cartId" = ${cartId}::uuid)) st
      ON st.variant_id = l."variantId"
    WHERE l."cartId" = ${cartId}::uuid
    ORDER BY l."createdAt", l.id`;
  const lines = rows.map((row) => {
    const unit = money(row.price, row.currency.trim());
    const stock = lineStock(row.max_quantity, row.quantity);
    return {
      variantId: toTypeId("variant", row.variant_id),
      productHandle: row.product_handle,
      productTitle: row.product_title,
      variantTitle: row.variant_title,
      quantity: row.quantity,
      unitPrice: toJSON(unit),
      lineTotal: toJSON(multiply(unit, row.quantity)),
      image: imageDto(row.image, row.product_title),
      available: stock === "in_stock" || stock === "limited",
      stock,
      maxQuantity: maxQuantityOf(row.max_quantity),
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

/**
 * A requested quantity: a whole number from `min`, never clamped. Above the
 * cart's per-line limit it is refused, not reduced.
 */
function parseQuantity(value: unknown, min: 0 | 1): number {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\s*\d{1,6}\s*$/.test(text) || Number(text) < min) {
    throw validationFailed({
      quantity: min === 1 ? "Enter a quantity of 1 or more." : "Enter a quantity of 0 or more.",
    });
  }
  const n = Number(text);
  if (n > CART_LIMITS.maxQuantity) throw overLimit();
  return n;
}

const overLimit = () =>
  new CartQuantityError(
    "limit",
    `You can have at most ${String(CART_LIMITS.maxQuantity)} of an item in your cart.`,
  );

/** Refuses `total` of a variant unless stock (app_variant_stock) can supply it. */
function assertSuppliable(stockMax: number | null, total: number, inCart = 0): void {
  if (total > CART_LIMITS.maxQuantity) throw overLimit();
  if (stockMax === null || total <= stockMax) return;
  if (stockMax === 0) throw new CartQuantityError("sold_out", "This item is sold out.", 0);
  const already = inCart > 0 ? ` You already have ${String(inCart)} in your cart.` : "";
  throw new CartQuantityError("stock", `${onlyAvailable(stockMax)}${already}`, stockMax);
}

/** A variant that is sellable in this store right now, with its stock ceiling; else NOT_FOUND. */
async function sellableVariant(
  tx: TenantTx,
  variantPublicId: unknown,
): Promise<{ id: string; stockMax: number | null }> {
  const id = typeof variantPublicId === "string" ? parseTypeId("variant", variantPublicId) : null;
  if (!id) throw notFound();
  const rows = await tx.$queryRaw<{ id: string; max_quantity: number | null }[]>`
    SELECT variant_id AS id, max_quantity FROM app_variant_stock(ARRAY[${id}::uuid])`;
  const row = rows[0];
  if (!row) throw notFound();
  return { id: row.id, stockMax: row.max_quantity };
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

/**
 * Adds a variant; the quantity is added to an existing line. The line's new
 * total must fit the cart's limit and what stock can supply, or nothing changes.
 */
export async function addToCart(
  ctx: CartMutationContext,
  input: { readonly variantId: unknown; readonly quantity?: unknown },
): Promise<CartResult> {
  await rateLimit(ctx.store, ctx.clientIp, ctx.token);
  const quantity = parseQuantity(input.quantity ?? 1, 1);
  return withStorefront(ctx.store, async (tx) => {
    const variant = await sellableVariant(tx, input.variantId);
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
    const existing = await tx.$queryRaw<{ n: bigint; has: boolean; in_cart: number | null }[]>`
      SELECT count(*) AS n, bool_or("variantId" = ${variant.id}::uuid) AS has,
        max(quantity) FILTER (WHERE "variantId" = ${variant.id}::uuid) AS in_cart
      FROM "CartLine" WHERE "cartId" = ${cartId}::uuid`;
    const has = existing[0]?.has === true;
    const inCart = existing[0]?.in_cart ?? 0;
    assertSuppliable(variant.stockMax, inCart + quantity, inCart);
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
        SET quantity = "CartLine".quantity + EXCLUDED.quantity, "updatedAt" = now()`;
    await touch(tx, cartId);
    return { cart: await viewCart(tx, cartId, ctx.store.currency), newToken };
  });
}

/**
 * Sets a line's quantity; 0 removes it. A line that isn't in the cart is
 * "not found"; a quantity stock can't supply is refused and the line keeps
 * its quantity. Lowering a line is refused too while still above what can
 * be supplied, so the message says how many can be had.
 */
export async function updateCartLine(
  ctx: CartMutationContext,
  input: { readonly variantId: unknown; readonly quantity: unknown },
): Promise<CartResult> {
  await rateLimit(ctx.store, ctx.clientIp, ctx.token);
  const quantity = parseQuantity(input.quantity, 0);
  const variantId =
    typeof input.variantId === "string" ? parseTypeId("variant", input.variantId) : null;
  return withStorefront(ctx.store, async (tx) => {
    const cartId = await findCart(tx, ctx.token, true);
    if (!cartId || !variantId) throw notFound();
    if (quantity > 0) {
      const variant = await sellableVariant(tx, toTypeId("variant", variantId));
      assertSuppliable(variant.stockMax, quantity);
    }
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
