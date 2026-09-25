import "server-only";
import { Prisma } from "@storevia/database";
import { recordAudit, parseInput, type TenantContext, type StoreContext } from "@storevia/tenancy";
import { notFound, type DomainError } from "@storevia/types";
import {
  adjustInventorySchema,
  moveInventorySchema,
  setInventorySchema,
  INVENTORY_QUANTITY_LIMIT,
} from "@storevia/validation";
import { conflict, inStore, internalId, publicId, type TenantTx } from "./internal";
import { ensureDefaultLocation } from "./locations";

// The single write path for stock (ADR-0027 §8). Every change locks the
// level row(s) in a deterministic order, applies a conditional update in SQL
// and appends to the movement ledger in the same transaction. Nothing reads
// stock, computes in memory and writes it back.

export type MovementReason =
  "INITIAL" | "MANUAL_ADJUSTMENT" | "RESTOCK" | "CORRECTION" | "TRANSFER";

/** Low stock threshold (a store setting later). */
export const LOW_STOCK_THRESHOLD = 5;

interface ItemRow {
  readonly itemId: string;
  readonly tracked: boolean;
  readonly policy: "DENY" | "CONTINUE";
  readonly variantTitle: string;
  readonly productTitle: string;
}

/** The variant's inventory item, locked against concurrent tracking changes. */
async function loadItem(tx: TenantTx, variantId: string): Promise<ItemRow> {
  const rows = await tx.$queryRaw<ItemRow[]>`
    SELECT ii.id AS "itemId", ii.tracked, v."inventoryPolicy" AS policy,
           v.title AS "variantTitle", p.title AS "productTitle"
    FROM "InventoryItem" ii
    JOIN "ProductVariant" v ON v.id = ii."variantId"
    JOIN "Product" p ON p.id = v."productId"
    WHERE ii."variantId" = ${variantId}::uuid AND v."deletedAt" IS NULL
    FOR SHARE OF ii`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

interface LocationRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly isActive: boolean;
}

async function loadLocation(tx: TenantTx, locationId: string): Promise<LocationRow> {
  const location = await tx.location.findFirst({
    where: { id: locationId, deletedAt: null },
    select: { id: true, name: true, code: true, isActive: true },
  });
  if (!location) throw notFound();
  return location;
}

/**
 * Locks (creating if needed) the level rows for an item at the given
 * locations, always in location-id order so two transfers in opposite
 * directions can't deadlock. Returns the ids of levels created now.
 */
async function lockLevels(
  tx: TenantTx,
  ctx: StoreContext,
  itemId: string,
  locationIds: readonly string[],
): Promise<Map<string, { levelId: string; available: number; created: boolean }>> {
  const ordered = [...new Set(locationIds)].sort();
  const result = new Map<string, { levelId: string; available: number; created: boolean }>();
  for (const locationId of ordered) {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "InventoryLevel" (id, "organisationId", "storeId", "inventoryItemId", "locationId", available, "updatedAt")
      VALUES (gen_random_uuid(), ${ctx.organisationId}::uuid, ${ctx.storeId}::uuid, ${itemId}::uuid, ${locationId}::uuid, 0, now())
      ON CONFLICT ("inventoryItemId", "locationId") DO NOTHING
      RETURNING id`;
    const locked = await tx.$queryRaw<{ id: string; available: number }[]>`
      SELECT id, available FROM "InventoryLevel"
      WHERE "inventoryItemId" = ${itemId}::uuid AND "locationId" = ${locationId}::uuid
      FOR UPDATE`;
    const level = locked[0];
    if (!level) throw notFound();
    result.set(locationId, {
      levelId: level.id,
      available: level.available,
      created: inserted.length > 0,
    });
  }
  return result;
}

interface ApplyResult {
  readonly previous: number;
  readonly resulting: number;
}

/**
 * The conditional update: refuses a result below zero unless the variant may
 * be oversold (CONTINUE), and refuses overflow. The row is already locked;
 * the condition still guards the invariant in SQL.
 */
async function applyDelta(
  tx: TenantTx,
  levelId: string,
  delta: number,
  allowNegative: boolean,
): Promise<ApplyResult | null> {
  const rows = await tx.$queryRaw<{ available: number }[]>`
    UPDATE "InventoryLevel"
    SET available = available + ${delta}, "updatedAt" = now()
    WHERE id = ${levelId}::uuid
      AND (available + ${delta} >= 0 OR ${allowNegative})
      AND abs(available::bigint + ${delta}) <= ${INVENTORY_QUANTITY_LIMIT}
    RETURNING available`;
  const row = rows[0];
  return row ? { previous: row.available - delta, resulting: row.available } : null;
}

async function appendMovement(
  tx: TenantTx,
  ctx: StoreContext,
  movement: {
    readonly itemId: string;
    readonly locationId: string;
    readonly delta: number;
    readonly resultingValue: number;
    readonly reason: MovementReason;
    readonly note: string | null;
    readonly reference?: { readonly type: string; readonly id: string };
  },
): Promise<void> {
  await tx.inventoryMovement.create({
    data: {
      organisationId: ctx.organisationId,
      storeId: ctx.storeId,
      inventoryItemId: movement.itemId,
      locationId: movement.locationId,
      quantityName: "AVAILABLE",
      delta: movement.delta,
      resultingValue: movement.resultingValue,
      reason: movement.reason,
      note: movement.note,
      actorUserId: ctx.userId,
      referenceType: movement.reference?.type ?? null,
      referenceId: movement.reference?.id ?? null,
    },
    select: { id: true },
  });
}

function notEnoughStock(location: LocationRow, available: number): DomainError {
  return conflict(`Not enough stock at ${location.name}: ${String(available)} available.`, {
    delta: `Only ${String(available)} available at ${location.name}.`,
  });
}

function requireTrackedActive(item: ItemRow, location: LocationRow): void {
  if (!item.tracked) {
    throw conflict("This variant doesn't track inventory. Turn tracking on to record stock.");
  }
  if (!location.isActive) {
    throw conflict(`${location.name} is inactive. Activate it to change its stock.`);
  }
}

/**
 * Changes stock by a delta inside the caller's transaction. Used by the
 * public actions below and by product creation (INITIAL stock).
 */
export async function adjustInventoryInTx(
  tx: TenantTx,
  ctx: StoreContext,
  input: {
    readonly variantId: string;
    readonly locationId: string;
    readonly delta: number;
    readonly reason: MovementReason;
    readonly note: string | null;
  },
): Promise<{ resultingValue: number; item: ItemRow; location: LocationRow }> {
  const item = await loadItem(tx, input.variantId);
  const location = await loadLocation(tx, input.locationId);
  requireTrackedActive(item, location);
  const levels = await lockLevels(tx, ctx, item.itemId, [location.id]);
  const level = levels.get(location.id);
  if (!level) throw notFound();
  const applied = await applyDelta(tx, level.levelId, input.delta, item.policy === "CONTINUE");
  if (!applied) {
    if (Math.abs(level.available + input.delta) > INVENTORY_QUANTITY_LIMIT) {
      throw conflict("That quantity is too large.");
    }
    throw notEnoughStock(location, level.available);
  }
  await appendMovement(tx, ctx, {
    itemId: item.itemId,
    locationId: location.id,
    delta: input.delta,
    resultingValue: applied.resulting,
    reason: input.reason,
    note: input.note,
  });
  return { resultingValue: applied.resulting, item, location };
}

export interface InventoryChange {
  readonly variantId: string;
  readonly locationId: string;
  readonly available: number;
}

/** The store's default location, created as "Main location" if it has none yet. */
async function defaultLocationId(tx: TenantTx, store: StoreContext): Promise<string> {
  const location = await ensureDefaultLocation(tx, store);
  if (!location) throw notFound();
  return location.id;
}

/** Records a manual stock change (delta, location, reason, note, actor). Needs inventory.adjust. */
export async function adjustInventory(
  ctx: TenantContext,
  input: unknown,
): Promise<InventoryChange> {
  const data = parseInput(adjustInventorySchema, input);
  const variantId = internalId("variant", data.variantId);
  const chosen = data.locationId ? internalId("location", data.locationId) : null;
  return inStore(
    ctx,
    "inventory.adjust",
    async (tx, store) => {
      const locationId = chosen ?? (await defaultLocationId(tx, store));
      const { resultingValue, location } = await adjustInventoryInTx(tx, store, {
        variantId,
        locationId,
        delta: data.delta,
        reason: data.reason,
        note: data.note ?? null,
      });
      await recordAudit(
        tx,
        store,
        "inventory.adjusted",
        { type: "ProductVariant", id: variantId },
        {
          delta: data.delta,
          resultingValue,
          reason: data.reason,
          location: location.code,
          ...(data.note ? { note: data.note } : {}),
        },
      );
      return {
        variantId: data.variantId,
        locationId: publicId("location", locationId),
        available: resultingValue,
      };
    },
    { write: true },
  );
}

/**
 * "Set to N": reads the level under its row lock and records the difference
 * as a movement. A no-op when the quantity is already N.
 */
export async function setInventory(ctx: TenantContext, input: unknown): Promise<InventoryChange> {
  const data = parseInput(setInventorySchema, input);
  const variantId = internalId("variant", data.variantId);
  const chosen = data.locationId ? internalId("location", data.locationId) : null;
  return inStore(
    ctx,
    "inventory.adjust",
    async (tx, store) => {
      const locationId = chosen ?? (await defaultLocationId(tx, store));
      const publicLocationId = publicId("location", locationId);
      const item = await loadItem(tx, variantId);
      const location = await loadLocation(tx, locationId);
      requireTrackedActive(item, location);
      if (data.quantity < 0 && item.policy !== "CONTINUE") {
        throw conflict("Stock can't go below 0 unless the variant allows overselling.", {
          quantity: "Enter 0 or more.",
        });
      }
      const levels = await lockLevels(tx, store, item.itemId, [location.id]);
      const level = levels.get(location.id);
      if (!level) throw notFound();
      const delta = data.quantity - level.available;
      if (delta === 0) {
        return {
          variantId: data.variantId,
          locationId: publicLocationId,
          available: level.available,
        };
      }
      const hasHistory = await tx.inventoryMovement.findFirst({
        where: { inventoryItemId: item.itemId, locationId: location.id },
        select: { id: true },
      });
      const reason: MovementReason = hasHistory ? data.reason : "INITIAL";
      const applied = await applyDelta(tx, level.levelId, delta, true);
      if (!applied) throw conflict("That quantity is too large.");
      await appendMovement(tx, store, {
        itemId: item.itemId,
        locationId: location.id,
        delta,
        resultingValue: applied.resulting,
        reason,
        note: data.note ?? null,
      });
      await recordAudit(
        tx,
        store,
        "inventory.adjusted",
        { type: "ProductVariant", id: variantId },
        {
          delta,
          resultingValue: applied.resulting,
          reason,
          location: location.code,
          ...(data.note ? { note: data.note } : {}),
        },
      );
      return {
        variantId: data.variantId,
        locationId: publicLocationId,
        available: applied.resulting,
      };
    },
    { write: true },
  );
}

/**
 * Moves stock between two of the store's locations: both levels are locked
 * in a fixed order, the source may not go negative, and the two TRANSFER
 * movements share a reference so the ledger shows them as one move.
 */
export async function moveInventory(
  ctx: TenantContext,
  input: unknown,
): Promise<{ from: InventoryChange; to: InventoryChange }> {
  const data = parseInput(moveInventorySchema, input);
  const variantId = internalId("variant", data.variantId);
  const fromId = internalId("location", data.fromLocationId);
  const toId = internalId("location", data.toLocationId);
  return inStore(
    ctx,
    "inventory.adjust",
    async (tx, store) => {
      const item = await loadItem(tx, variantId);
      const from = await loadLocation(tx, fromId);
      const to = await loadLocation(tx, toId);
      requireTrackedActive(item, from);
      requireTrackedActive(item, to);
      const levels = await lockLevels(tx, store, item.itemId, [from.id, to.id]);
      const fromLevel = levels.get(from.id);
      const toLevel = levels.get(to.id);
      if (!fromLevel || !toLevel) throw notFound();
      const out = await applyDelta(tx, fromLevel.levelId, -data.quantity, false);
      if (!out) throw notEnoughStock(from, fromLevel.available);
      const into = await applyDelta(tx, toLevel.levelId, data.quantity, true);
      if (!into) throw conflict("That quantity is too large.");
      const reference = { type: "transfer", id: crypto.randomUUID() };
      const note = data.note ?? null;
      await appendMovement(tx, store, {
        itemId: item.itemId,
        locationId: from.id,
        delta: -data.quantity,
        resultingValue: out.resulting,
        reason: "TRANSFER",
        note,
        reference,
      });
      await appendMovement(tx, store, {
        itemId: item.itemId,
        locationId: to.id,
        delta: data.quantity,
        resultingValue: into.resulting,
        reason: "TRANSFER",
        note,
        reference,
      });
      await recordAudit(
        tx,
        store,
        "inventory.moved",
        { type: "ProductVariant", id: variantId },
        {
          quantity: data.quantity,
          fromLocation: from.code,
          toLocation: to.code,
          ...(note ? { note } : {}),
        },
      );
      return {
        from: {
          variantId: data.variantId,
          locationId: data.fromLocationId,
          available: out.resulting,
        },
        to: { variantId: data.variantId, locationId: data.toLocationId, available: into.resulting },
      };
    },
    { write: true },
  );
}

// --- reads -------------------------------------------------------------------

export interface VariantStock {
  readonly variantId: string;
  readonly tracked: boolean;
  readonly inventoryPolicy: "DENY" | "CONTINUE";
  /** Summed over active locations. */
  readonly available: number;
  readonly reserved: number;
  /** on hand = available + reserved (ADR-0027 §2). */
  readonly onHand: number;
  readonly levels: readonly {
    readonly locationId: string;
    readonly locationName: string;
    readonly locationCode: string;
    readonly isActive: boolean;
    readonly available: number;
    readonly reserved: number;
    readonly onHand: number;
  }[];
}

/** Stock for a product's variants at every location (one query for all variants). */
export async function getProductStock(
  ctx: TenantContext,
  productPublicId: string,
): Promise<VariantStock[]> {
  const productId = internalId("product", productPublicId);
  return inStore(ctx, "inventory.read", async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw notFound();
    const variants = await tx.productVariant.findMany({
      where: { productId, deletedAt: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: {
        id: true,
        inventoryPolicy: true,
        inventoryItem: {
          select: {
            tracked: true,
            levels: {
              where: { location: { deletedAt: null } },
              select: {
                available: true,
                reserved: true,
                location: { select: { id: true, name: true, code: true, isActive: true } },
              },
              orderBy: { location: { name: "asc" } },
            },
          },
        },
      },
    });
    return variants.map((v) => {
      const levels = (v.inventoryItem?.levels ?? []).map((l) => ({
        locationId: publicId("location", l.location.id),
        locationName: l.location.name,
        locationCode: l.location.code,
        isActive: l.location.isActive,
        available: l.available,
        reserved: l.reserved,
        onHand: l.available + l.reserved,
      }));
      const active = levels.filter((l) => l.isActive);
      const available = active.reduce((n, l) => n + l.available, 0);
      const reserved = active.reduce((n, l) => n + l.reserved, 0);
      return {
        variantId: publicId("variant", v.id),
        tracked: v.inventoryItem?.tracked ?? false,
        inventoryPolicy: v.inventoryPolicy,
        available,
        reserved,
        onHand: available + reserved,
        levels,
      };
    });
  });
}

export interface MovementView {
  readonly id: string;
  readonly createdAt: Date;
  readonly delta: number;
  readonly resultingValue: number;
  readonly reason: string;
  readonly note: string | null;
  readonly locationName: string;
  readonly variantTitle: string;
  readonly productTitle: string;
  readonly productId: string;
  readonly actorName: string | null;
}

/** The movement ledger, newest first, keyset-paginated. */
export async function listMovements(
  ctx: TenantContext,
  options: {
    readonly productId?: string | undefined;
    readonly locationId?: string | undefined;
    readonly before?: string | undefined;
    readonly limit?: number | undefined;
  } = {},
): Promise<{ movements: MovementView[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const productId = options.productId ? internalId("product", options.productId) : null;
  const locationId = options.locationId ? internalId("location", options.locationId) : null;
  const cursor = decodeMovementCursor(options.before);
  return inStore(ctx, "inventory.read", async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string;
        createdAt: Date;
        delta: number;
        resultingValue: number;
        reason: string;
        note: string | null;
        locationName: string;
        variantTitle: string;
        productTitle: string;
        productId: string;
        actorName: string | null;
      }[]
    >`
      SELECT m.id, m."createdAt", m.delta, m."resultingValue", m.reason::text AS reason, m.note,
             l.name AS "locationName", v.title AS "variantTitle", p.title AS "productTitle",
             p.id AS "productId", u.name AS "actorName"
      FROM "InventoryMovement" m
      JOIN "Location" l ON l.id = m."locationId"
      JOIN "InventoryItem" ii ON ii.id = m."inventoryItemId"
      JOIN "ProductVariant" v ON v.id = ii."variantId"
      JOIN "Product" p ON p.id = v."productId"
      -- RLS on User reveals only current co-members; former members stay unnamed.
      LEFT JOIN "User" u ON u.id = m."actorUserId"
      WHERE TRUE
        ${productId ? Prisma.sql`AND p.id = ${productId}::uuid` : Prisma.empty}
        ${locationId ? Prisma.sql`AND m."locationId" = ${locationId}::uuid` : Prisma.empty}
        ${cursor ? Prisma.sql`AND (m."createdAt", m.id) < (${cursor.createdAt}, ${cursor.id}::uuid)` : Prisma.empty}
      ORDER BY m."createdAt" DESC, m.id DESC
      LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      movements: page.map((r) => ({ ...r, productId: publicId("product", r.productId) })),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(JSON.stringify([last.createdAt.toISOString(), last.id])).toString(
              "base64url",
            )
          : null,
    };
  });
}

function decodeMovementCursor(value: string | undefined): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      /^[0-9a-f-]{36}$/.test(parsed[1])
    ) {
      const createdAt = new Date(parsed[0]);
      if (!Number.isNaN(createdAt.getTime())) return { createdAt, id: parsed[1] };
    }
  } catch {
    // An unreadable cursor starts from the top.
  }
  return null;
}

/** Turns tracking on or off for a variant. Stock and history are kept either way. */
export async function setInventoryTracking(
  ctx: TenantContext,
  variantPublicId: string,
  tracked: boolean,
): Promise<void> {
  const variantId = internalId("variant", variantPublicId);
  await inStore(
    ctx,
    "inventory.adjust",
    async (tx, store) => {
      const updated = await tx.inventoryItem.updateMany({
        where: { variantId, variant: { deletedAt: null } },
        data: { tracked },
      });
      if (updated.count === 0) throw notFound();
      await recordAudit(
        tx,
        store,
        "inventory.tracking_changed",
        { type: "ProductVariant", id: variantId },
        {
          value: tracked,
        },
      );
    },
    { write: true },
  );
}

export interface InventoryRow {
  readonly productId: string;
  readonly productTitle: string;
  readonly productStatus: "DRAFT" | "ACTIVE" | "ARCHIVED";
  readonly variantId: string;
  readonly variantTitle: string;
  readonly sku: string | null;
  readonly tracked: boolean;
  readonly inventoryPolicy: "DENY" | "CONTINUE";
  /** Available per active location (public location id → units). */
  readonly levels: Readonly<Record<string, number>>;
  readonly available: number;
  readonly image: { readonly storageKey: string; readonly renditions: unknown } | null;
}

export type InventoryStockFilter = "low_stock" | "out_of_stock";

/**
 * Stock for every live variant of the store's non-archived products, one row
 * per variant with a level per active location. Keyset-paginated on
 * (product title, product, variant position, variant); one query per page.
 */
export async function listInventory(
  ctx: TenantContext,
  options: {
    readonly q?: string | undefined;
    readonly stock?: InventoryStockFilter | undefined;
    readonly after?: string | undefined;
    readonly limit?: number | undefined;
  } = {},
): Promise<{ rows: InventoryRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const cursor = decodeInventoryCursor(options.after);
  const q = options.q?.trim().toLowerCase().slice(0, 200) ?? "";
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return inStore(ctx, "inventory.read", async (tx) => {
    const rows = await tx.$queryRaw<
      {
        productId: string;
        productTitle: string;
        productStatus: "DRAFT" | "ACTIVE" | "ARCHIVED";
        variantId: string;
        variantTitle: string;
        position: number;
        sku: string | null;
        tracked: boolean | null;
        inventoryPolicy: "DENY" | "CONTINUE";
        levels: { locationId: string; available: number }[] | null;
        available: bigint;
        storageKey: string | null;
        renditions: unknown;
      }[]
    >`
      SELECT p.id AS "productId", p.title AS "productTitle", p.status::text AS "productStatus",
             v.id AS "variantId", v.title AS "variantTitle", v.position, v.sku,
             ii.tracked, v."inventoryPolicy"::text AS "inventoryPolicy",
             st.levels, coalesce(st.available, 0)::bigint AS available,
             img."storageKey", img.renditions
      FROM "ProductVariant" v
      JOIN "Product" p ON p.id = v."productId" AND p."deletedAt" IS NULL AND p.status <> 'ARCHIVED'
      LEFT JOIN "InventoryItem" ii ON ii."variantId" = v.id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('locationId', l."locationId", 'available', l.available)) AS levels,
               sum(l.available) AS available
        FROM "InventoryLevel" l
        JOIN "Location" loc ON loc.id = l."locationId" AND loc."isActive" AND loc."deletedAt" IS NULL
        WHERE l."inventoryItemId" = ii.id
      ) st ON true
      LEFT JOIN LATERAL (
        SELECT m."storageKey", m.renditions FROM "MediaAsset" m
        WHERE m.id = coalesce(v."imageMediaId", (
          SELECT pm."mediaAssetId" FROM "ProductMedia" pm WHERE pm."productId" = p.id ORDER BY pm.position LIMIT 1))
          AND m."deletedAt" IS NULL AND m.status = 'READY'
      ) img ON true
      WHERE v."deletedAt" IS NULL
        ${q ? Prisma.sql`AND (lower(p.title) LIKE ${like} OR lower(v.title) LIKE ${like} OR lower(v.sku) LIKE ${like})` : Prisma.empty}
        ${options.stock === "out_of_stock" ? Prisma.sql`AND ii.tracked AND v."inventoryPolicy" = 'DENY' AND coalesce(st.available, 0) <= 0` : Prisma.empty}
        ${options.stock === "low_stock" ? Prisma.sql`AND ii.tracked AND st.available > 0 AND st.available <= ${LOW_STOCK_THRESHOLD}` : Prisma.empty}
        ${cursor ? Prisma.sql`AND (lower(p.title), p.id, v.position, v.id) > (${cursor[0]}, ${cursor[1]}::uuid, ${cursor[2]}, ${cursor[3]}::uuid)` : Prisma.empty}
      ORDER BY lower(p.title), p.id, v.position, v.id
      LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      rows: page.map((r) => ({
        productId: publicId("product", r.productId),
        productTitle: r.productTitle,
        productStatus: r.productStatus,
        variantId: publicId("variant", r.variantId),
        variantTitle: r.variantTitle,
        sku: r.sku,
        tracked: r.tracked ?? false,
        inventoryPolicy: r.inventoryPolicy,
        levels: Object.fromEntries(
          (r.levels ?? []).map((l) => [publicId("location", l.locationId), l.available]),
        ),
        available: Number(r.available),
        image: r.storageKey ? { storageKey: r.storageKey, renditions: r.renditions } : null,
      })),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify([
                last.productTitle.toLowerCase(),
                last.productId,
                last.position,
                last.variantId,
              ]),
            ).toString("base64url")
          : null,
    };
  });
}

function decodeInventoryCursor(value: string | undefined): [string, string, number, string] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      /^[0-9a-f-]{36}$/.test(parsed[1]) &&
      typeof parsed[2] === "number" &&
      Number.isInteger(parsed[2]) &&
      typeof parsed[3] === "string" &&
      /^[0-9a-f-]{36}$/.test(parsed[3])
    ) {
      return [parsed[0], parsed[1], parsed[2], parsed[3]];
    }
  } catch {
    // An unreadable cursor starts from the first page.
  }
  return null;
}
