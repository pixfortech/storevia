import type { TenantTx } from "@storevia/database";
import { uuidv7 } from "@storevia/types";

// Stock for checkouts and orders (ADR-0031 §3), on the M3 ledger: every
// change updates InventoryLevel under a row lock and appends movements.
//
//   reserve   available −q, reserved +q   RESERVATION           (beginPayment)
//   release   available +q, reserved −q   RESERVATION_RELEASE   (failed/expired payment)
//   convert   reservation → CONVERTED, stock stays reserved     (order created)
//   fulfil    reserved −q                 FULFILMENT
//   cancel    available +q, reserved −q   CANCELLATION
//   restock   available +q                RETURN
//
// Levels are always locked in (inventoryItemId, locationId) order, so two
// transactions over the same items serialise instead of deadlocking. Each
// cart line reserves at one location (the first active, online-fulfilling
// one by priority that has the quantity), so an order line has at most one
// reservation.

export interface StockScope {
  readonly organisationId: string;
  readonly storeId: string;
}

export interface StockLine {
  readonly variantId: string;
  readonly quantity: number;
}

type Reason = "RESERVATION" | "RESERVATION_RELEASE" | "FULFILMENT" | "CANCELLATION" | "RETURN";

interface Reference {
  readonly type: "Checkout" | "Order";
  readonly id: string;
}

async function appendMovements(
  tx: TenantTx,
  scope: StockScope,
  rows: readonly {
    readonly itemId: string;
    readonly locationId: string;
    readonly quantityName: "AVAILABLE" | "RESERVED";
    readonly delta: number;
    readonly resultingValue: number;
    readonly reason: Reason;
  }[],
  reference: Reference,
  actorUserId: string | null,
): Promise<void> {
  for (const row of rows) {
    if (row.delta === 0) continue;
    await tx.$executeRaw`
      INSERT INTO "InventoryMovement" (id, "organisationId", "storeId", "inventoryItemId", "locationId",
        "quantityName", delta, "resultingValue", reason, "referenceType", "referenceId", "actorUserId")
      VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
        ${row.itemId}::uuid, ${row.locationId}::uuid, ${row.quantityName}::"InventoryQuantityName",
        ${row.delta}, ${row.resultingValue}, ${row.reason}::"InventoryMovementReason",
        ${reference.type}, ${reference.id}::uuid, ${actorUserId}::uuid)`;
  }
}

/** Moves stock on one (already locked) level and records both quantities that changed. */
async function moveLevel(
  tx: TenantTx,
  scope: StockScope,
  level: { readonly itemId: string; readonly locationId: string },
  change: { readonly available: number; readonly reserved: number },
  reason: Reason,
  reference: Reference,
  actorUserId: string | null = null,
): Promise<void> {
  const rows = await tx.$queryRaw<{ available: number; reserved: number }[]>`
    UPDATE "InventoryLevel"
    SET available = available + ${change.available}, reserved = reserved + ${change.reserved},
      "updatedAt" = now()
    WHERE "inventoryItemId" = ${level.itemId}::uuid AND "locationId" = ${level.locationId}::uuid
    RETURNING available, reserved`;
  const row = rows[0];
  if (!row) throw new Error("inventory level disappeared under lock");
  await appendMovements(
    tx,
    scope,
    [
      {
        ...level,
        quantityName: "AVAILABLE",
        delta: change.available,
        resultingValue: row.available,
        reason,
      },
      {
        ...level,
        quantityName: "RESERVED",
        delta: change.reserved,
        resultingValue: row.reserved,
        reason,
      },
    ],
    reference,
    actorUserId,
  );
}

/** Locks the levels of these (item, location) pairs, in the global lock order. */
async function lockLevels(
  tx: TenantTx,
  pairs: readonly { readonly itemId: string; readonly locationId: string }[],
): Promise<void> {
  if (pairs.length === 0) return;
  const items = pairs.map((p) => p.itemId);
  const locations = pairs.map((p) => p.locationId);
  await tx.$queryRaw`
    SELECT lv.id FROM "InventoryLevel" lv
    JOIN unnest(${items}::uuid[], ${locations}::uuid[]) AS k(item, location)
      ON lv."inventoryItemId" = k.item AND lv."locationId" = k.location
    ORDER BY lv."inventoryItemId", lv."locationId"
    FOR UPDATE OF lv`;
}

interface ItemRow {
  item_id: string;
  variant_id: string;
  tracked: boolean;
  policy: "DENY" | "CONTINUE";
}

interface LevelRow {
  item_id: string;
  location_id: string;
  available: number;
}

export type ReserveResult =
  | { readonly ok: true; readonly shortage: boolean }
  | { readonly ok: false; readonly variantId: string };

/**
 * Reserves stock for a checkout's lines. Without `force`, a DENY variant
 * that no location can supply fails the whole reservation (the caller rolls
 * back). With `force` (a payment already captured), every line is reserved
 * anyway, below zero if need be, and `shortage` reports that it happened.
 */
export async function reserveStock(
  tx: TenantTx,
  scope: StockScope,
  checkoutId: string,
  lines: readonly StockLine[],
  expiresAt: Date,
  options: { readonly force?: boolean } = {},
): Promise<ReserveResult> {
  const force = options.force === true;
  const quantities = new Map<string, number>();
  for (const line of lines) {
    quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
  }
  if (quantities.size === 0) return { ok: true, shortage: false };
  const items = await tx.$queryRaw<ItemRow[]>`
    SELECT ii.id AS item_id, ii."variantId" AS variant_id, ii.tracked,
      coalesce(v."inventoryPolicy"::text, 'DENY') AS policy
    FROM "InventoryItem" ii
    LEFT JOIN "ProductVariant" v ON v.id = ii."variantId"
    WHERE ii."variantId" = ANY(${[...quantities.keys()]}::uuid[]) AND ii.tracked
    ORDER BY ii.id`;
  if (items.length === 0) return { ok: true, shortage: false };

  // Candidate levels at locations that fulfil online orders, locked in order.
  const levels = await tx.$queryRaw<LevelRow[]>`
    SELECT lv."inventoryItemId" AS item_id, lv."locationId" AS location_id, lv.available
    FROM "InventoryLevel" lv
    WHERE lv."inventoryItemId" = ANY(${items.map((i) => i.item_id)}::uuid[])
    ORDER BY lv."inventoryItemId", lv."locationId"
    FOR UPDATE OF lv`;
  const locations = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Location"
    WHERE "isActive" AND "fulfilsOnlineOrders" AND "deletedAt" IS NULL
    ORDER BY priority ASC, id ASC`;
  const rank = new Map(locations.map((l, i) => [l.id, i]));

  let shortage = false;
  for (const item of items) {
    const quantity = quantities.get(item.variant_id) ?? 0;
    const candidates = levels
      .filter((l) => l.item_id === item.item_id && rank.has(l.location_id))
      .sort((a, b) => (rank.get(a.location_id) ?? 0) - (rank.get(b.location_id) ?? 0));
    let locationId = candidates.find((l) => l.available >= quantity)?.location_id ?? null;
    if (!locationId) {
      if (item.policy === "DENY" && !force) return { ok: false, variantId: item.variant_id };
      if (item.policy === "DENY") shortage = true;
      // Oversell (CONTINUE, or a capture that must be honoured): the first location.
      locationId = candidates[0]?.location_id ?? locations[0]?.id ?? null;
      if (!locationId) {
        // Nowhere fulfils online orders: nothing to reserve against.
        if (item.policy === "DENY") shortage = true;
        continue;
      }
      if (!candidates.some((l) => l.location_id === locationId)) {
        await tx.$executeRaw`
          INSERT INTO "InventoryLevel" (id, "organisationId", "storeId", "inventoryItemId", "locationId", "updatedAt")
          VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
            ${item.item_id}::uuid, ${locationId}::uuid, now())
          ON CONFLICT ("inventoryItemId", "locationId") DO NOTHING`;
        await lockLevels(tx, [{ itemId: item.item_id, locationId }]);
      }
    }
    const level = { itemId: item.item_id, locationId };
    await moveLevel(tx, scope, level, { available: -quantity, reserved: quantity }, "RESERVATION", {
      type: "Checkout",
      id: checkoutId,
    });
    await tx.$executeRaw`
      INSERT INTO "InventoryReservation" (id, "organisationId", "storeId", "inventoryItemId",
        "locationId", "checkoutId", quantity, status, "expiresAt", "updatedAt")
      VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
        ${item.item_id}::uuid, ${locationId}::uuid, ${checkoutId}::uuid, ${quantity}, 'ACTIVE',
        ${expiresAt}, now())`;
  }
  return { ok: true, shortage };
}

interface ReservationRow {
  id: string;
  item_id: string;
  location_id: string;
  quantity: number;
}

/** Returns a checkout's active reservations to sale (failed, cancelled or expired payment). */
export async function releaseCheckoutStock(
  tx: TenantTx,
  scope: StockScope,
  checkoutId: string,
): Promise<number> {
  const reservations = await tx.$queryRaw<ReservationRow[]>`
    SELECT id, "inventoryItemId" AS item_id, "locationId" AS location_id, quantity
    FROM "InventoryReservation"
    WHERE "checkoutId" = ${checkoutId}::uuid AND status = 'ACTIVE'
    ORDER BY "inventoryItemId", "locationId"
    FOR UPDATE`;
  if (reservations.length === 0) return 0;
  await lockLevels(
    tx,
    reservations.map((r) => ({ itemId: r.item_id, locationId: r.location_id })),
  );
  for (const r of reservations) {
    await moveLevel(
      tx,
      scope,
      { itemId: r.item_id, locationId: r.location_id },
      { available: r.quantity, reserved: -r.quantity },
      "RESERVATION_RELEASE",
      { type: "Checkout", id: checkoutId },
    );
  }
  await tx.$executeRaw`
    UPDATE "InventoryReservation" SET status = 'RELEASED', "updatedAt" = now()
    WHERE id = ANY(${reservations.map((r) => r.id)}::uuid[])`;
  return reservations.length;
}

/** Hands a checkout's active reservations to the order lines (stock stays reserved). */
export async function convertCheckoutStock(
  tx: TenantTx,
  checkoutId: string,
  orderId: string,
  lineByVariant: ReadonlyMap<string, string>,
): Promise<void> {
  const reservations = await tx.$queryRaw<{ id: string; variant_id: string }[]>`
    SELECT r.id, ii."variantId" AS variant_id
    FROM "InventoryReservation" r
    JOIN "InventoryItem" ii ON ii.id = r."inventoryItemId"
    WHERE r."checkoutId" = ${checkoutId}::uuid AND r.status = 'ACTIVE'
    FOR UPDATE OF r`;
  for (const r of reservations) {
    const lineId = lineByVariant.get(r.variant_id);
    if (!lineId) throw new Error("reservation has no order line");
    await tx.$executeRaw`
      UPDATE "InventoryReservation"
      SET status = 'CONVERTED', "orderId" = ${orderId}::uuid, "orderLineId" = ${lineId}::uuid,
        "updatedAt" = now()
      WHERE id = ${r.id}::uuid`;
  }
}

/** An order line's reservation (at most one), for fulfilment and cancellation. */
export interface LineReservation {
  readonly id: string;
  readonly orderLineId: string;
  readonly itemId: string;
  readonly locationId: string;
  readonly quantity: number;
}

export async function orderReservations(tx: TenantTx, orderId: string): Promise<LineReservation[]> {
  const rows = await tx.$queryRaw<
    { id: string; line_id: string; item_id: string; location_id: string; quantity: number }[]
  >`
    SELECT id, "orderLineId" AS line_id, "inventoryItemId" AS item_id, "locationId" AS location_id,
      quantity
    FROM "InventoryReservation"
    WHERE "orderId" = ${orderId}::uuid AND status = 'CONVERTED'
    ORDER BY "inventoryItemId", "locationId"`;
  return rows.map((r) => ({
    id: r.id,
    orderLineId: r.line_id,
    itemId: r.item_id,
    locationId: r.location_id,
    quantity: r.quantity,
  }));
}

/** Ships reserved stock out: `reserved −q` per line (FULFILMENT). */
export async function fulfilStock(
  tx: TenantTx,
  scope: StockScope,
  orderId: string,
  moves: readonly { readonly reservation: LineReservation; readonly quantity: number }[],
  actorUserId: string | null,
): Promise<void> {
  const sorted = [...moves].sort((a, b) =>
    a.reservation.itemId === b.reservation.itemId
      ? a.reservation.locationId.localeCompare(b.reservation.locationId)
      : a.reservation.itemId.localeCompare(b.reservation.itemId),
  );
  await lockLevels(
    tx,
    sorted.map((m) => ({ itemId: m.reservation.itemId, locationId: m.reservation.locationId })),
  );
  for (const move of sorted) {
    if (move.quantity <= 0) continue;
    await moveLevel(
      tx,
      scope,
      { itemId: move.reservation.itemId, locationId: move.reservation.locationId },
      { available: 0, reserved: -move.quantity },
      "FULFILMENT",
      { type: "Order", id: orderId },
      actorUserId,
    );
  }
}

/** Returns an order's unfulfilled reservations to sale (CANCELLATION). */
export async function cancelOrderStock(
  tx: TenantTx,
  scope: StockScope,
  orderId: string,
  moves: readonly { readonly reservation: LineReservation; readonly quantity: number }[],
  actorUserId: string | null,
): Promise<void> {
  const sorted = [...moves].sort((a, b) =>
    a.reservation.itemId === b.reservation.itemId
      ? a.reservation.locationId.localeCompare(b.reservation.locationId)
      : a.reservation.itemId.localeCompare(b.reservation.itemId),
  );
  await lockLevels(
    tx,
    sorted.map((m) => ({ itemId: m.reservation.itemId, locationId: m.reservation.locationId })),
  );
  for (const move of sorted) {
    if (move.quantity > 0) {
      await moveLevel(
        tx,
        scope,
        { itemId: move.reservation.itemId, locationId: move.reservation.locationId },
        { available: move.quantity, reserved: -move.quantity },
        "CANCELLATION",
        { type: "Order", id: orderId },
        actorUserId,
      );
    }
    await tx.$executeRaw`
      UPDATE "InventoryReservation" SET status = 'RELEASED', "updatedAt" = now()
      WHERE id = ${move.reservation.id}::uuid`;
  }
}

/** Puts returned units back on sale at a location (RETURN). */
export async function restockStock(
  tx: TenantTx,
  scope: StockScope,
  orderId: string,
  moves: readonly {
    readonly itemId: string;
    readonly locationId: string;
    readonly quantity: number;
  }[],
  actorUserId: string | null,
): Promise<void> {
  const sorted = [...moves]
    .filter((m) => m.quantity > 0)
    .sort((a, b) =>
      a.itemId === b.itemId
        ? a.locationId.localeCompare(b.locationId)
        : a.itemId.localeCompare(b.itemId),
    );
  for (const move of sorted) {
    await tx.$executeRaw`
      INSERT INTO "InventoryLevel" (id, "organisationId", "storeId", "inventoryItemId", "locationId", "updatedAt")
      VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
        ${move.itemId}::uuid, ${move.locationId}::uuid, now())
      ON CONFLICT ("inventoryItemId", "locationId") DO NOTHING`;
  }
  await lockLevels(tx, sorted);
  for (const move of sorted) {
    await moveLevel(
      tx,
      scope,
      { itemId: move.itemId, locationId: move.locationId },
      { available: move.quantity, reserved: 0 },
      "RETURN",
      { type: "Order", id: orderId },
      actorUserId,
    );
  }
}
