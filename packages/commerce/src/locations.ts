import "server-only";
import {
  isUniqueViolation,
  parseInput,
  recordAudit,
  type StoreContext,
  type TenantContext,
} from "@storevia/tenancy";
import { notFound } from "@storevia/types";
import { locationSchema } from "@storevia/validation";
import { conflict, inStore, internalId, publicId, storeSettings, type TenantTx } from "./internal";

// Locations (ADR-0027 §8): where stock is held. A store always keeps at least
// one active location; locations are deactivated, never deleted, in M3.

export interface LocationView {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly fulfilsOnlineOrders: boolean;
  /** Units available here, across tracked variants. */
  readonly available: number;
  /** Variants with a stock level here. */
  readonly stockedVariants: number;
}

const DEFAULT_LOCATION = { name: "Main location", code: "MAIN" } as const;

/**
 * The store's first active location, created as "Main location" (MAIN) the
 * first time the catalogue needs one. Serialised per store so two first
 * products can't create two defaults.
 */
export async function ensureDefaultLocation(
  tx: TenantTx,
  ctx: StoreContext,
  options: { readonly createIfMissing?: boolean } = {},
): Promise<{ id: string } | null> {
  const existing = await tx.location.findFirst({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (existing || options.createIfMissing === false) return existing;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ctx.storeId}:default-location`}, 0))`;
  const again = await tx.location.findFirst({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (again) return again;
  const { country } = await storeSettings(tx, ctx.storeId);
  // A deactivated MAIN keeps its code, so the default gets a free one.
  const taken = new Set(
    (await tx.location.findMany({ where: { deletedAt: null }, select: { code: true } })).map(
      (l) => l.code,
    ),
  );
  let code: string = DEFAULT_LOCATION.code;
  for (let n = 2; taken.has(code); n += 1) code = `MAIN-${String(n)}`;
  const created = await tx.location.create({
    data: {
      organisationId: ctx.organisationId,
      storeId: ctx.storeId,
      name: DEFAULT_LOCATION.name,
      code,
      countryCode: country,
    },
    select: { id: true },
  });
  await recordAudit(
    tx,
    ctx,
    "location.created",
    { type: "Location", id: created.id },
    {
      code,
      name: DEFAULT_LOCATION.name,
    },
  );
  return created;
}

async function toViews(tx: TenantTx, where: { id?: string }): Promise<LocationView[]> {
  const rows = await tx.location.findMany({
    where: { deletedAt: null, ...where },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      code: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      countryCode: true,
      phone: true,
      isActive: true,
      fulfilsOnlineOrders: true,
    },
  });
  if (rows.length === 0) return [];
  const totals = await tx.inventoryLevel.groupBy({
    by: ["locationId"],
    where: {
      locationId: { in: rows.map((r) => r.id) },
      inventoryItem: { tracked: true, variant: { deletedAt: null } },
    },
    _sum: { available: true },
    _count: { _all: true },
  });
  const byLocation = new Map(totals.map((t) => [t.locationId, t]));
  return rows.map((row) => ({
    ...row,
    id: publicId("location", row.id),
    available: byLocation.get(row.id)?._sum.available ?? 0,
    stockedVariants: byLocation.get(row.id)?._count._all ?? 0,
  }));
}

export async function listLocations(ctx: TenantContext): Promise<LocationView[]> {
  return inStore(ctx, "inventory.read", (tx) => toViews(tx, {}));
}

export async function getLocation(
  ctx: TenantContext,
  locationPublicId: string,
): Promise<LocationView> {
  const id = internalId("location", locationPublicId);
  return inStore(ctx, "inventory.read", async (tx) => {
    const [view] = await toViews(tx, { id });
    if (!view) throw notFound();
    return view;
  });
}

function codeTaken(): never {
  throw conflict("Another location already uses that code.", {
    code: "That code is already in use.",
  });
}

export async function createLocation(
  ctx: TenantContext,
  input: unknown,
): Promise<{ locationId: string }> {
  const data = parseInput(locationSchema, input);
  try {
    return await inStore(
      ctx,
      "location.manage",
      async (tx, store) => {
        const created = await tx.location.create({
          data: {
            organisationId: store.organisationId,
            storeId: store.storeId,
            name: data.name,
            code: data.code,
            addressLine1: data.addressLine1 ?? null,
            addressLine2: data.addressLine2 ?? null,
            city: data.city ?? null,
            region: data.region ?? null,
            postalCode: data.postalCode ?? null,
            countryCode: data.countryCode,
            phone: data.phone ?? null,
            fulfilsOnlineOrders: data.fulfilsOnlineOrders,
          },
          select: { id: true },
        });
        await recordAudit(
          tx,
          store,
          "location.created",
          { type: "Location", id: created.id },
          {
            code: data.code,
            name: data.name,
          },
        );
        return { locationId: publicId("location", created.id) };
      },
      { write: true },
    );
  } catch (error) {
    if (isUniqueViolation(error)) codeTaken();
    throw error;
  }
}

export async function updateLocation(
  ctx: TenantContext,
  locationPublicId: string,
  input: unknown,
): Promise<void> {
  const id = internalId("location", locationPublicId);
  const data = parseInput(locationSchema, input);
  try {
    await inStore(
      ctx,
      "location.manage",
      async (tx, store) => {
        const updated = await tx.location.updateMany({
          where: { id, deletedAt: null },
          data: {
            name: data.name,
            code: data.code,
            addressLine1: data.addressLine1 ?? null,
            addressLine2: data.addressLine2 ?? null,
            city: data.city ?? null,
            region: data.region ?? null,
            postalCode: data.postalCode ?? null,
            countryCode: data.countryCode,
            phone: data.phone ?? null,
            fulfilsOnlineOrders: data.fulfilsOnlineOrders,
          },
        });
        if (updated.count === 0) throw notFound();
        await recordAudit(
          tx,
          store,
          "location.updated",
          { type: "Location", id },
          {
            code: data.code,
            name: data.name,
          },
        );
      },
      { write: true },
    );
  } catch (error) {
    if (isUniqueViolation(error)) codeTaken();
    throw error;
  }
}

/**
 * Activates or deactivates a location. Deactivating is refused while the
 * location holds stock (move it first) or when it is the last active one.
 */
export async function setLocationActive(
  ctx: TenantContext,
  locationPublicId: string,
  active: boolean,
): Promise<void> {
  const id = internalId("location", locationPublicId);
  await inStore(
    ctx,
    "location.manage",
    async (tx, store) => {
      // Lock the store's active locations so two deactivations can't both pass the "last one" check.
      const actives = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Location" WHERE "deletedAt" IS NULL AND "isActive" ORDER BY id FOR UPDATE`;
      const location = await tx.location.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, code: true, isActive: true },
      });
      if (!location) throw notFound();
      if (location.isActive === active) return;
      if (!active) {
        if (actives.length <= 1) {
          throw conflict("A store needs at least one active location. Add another one first.");
        }
        const stock = await tx.inventoryLevel.aggregate({
          where: {
            locationId: id,
            inventoryItem: { tracked: true, variant: { deletedAt: null } },
            OR: [{ available: { not: 0 } }, { reserved: { gt: 0 } }],
          },
          _count: { _all: true },
        });
        if (stock._count._all > 0) {
          throw conflict(
            `This location still holds stock for ${String(stock._count._all)} ${stock._count._all === 1 ? "variant" : "variants"}. Move or adjust it to 0 first.`,
          );
        }
      }
      await tx.location.update({ where: { id }, data: { isActive: active }, select: { id: true } });
      await recordAudit(
        tx,
        store,
        active ? "location.activated" : "location.deactivated",
        {
          type: "Location",
          id,
        },
        { code: location.code },
      );
    },
    { write: true },
  );
}
