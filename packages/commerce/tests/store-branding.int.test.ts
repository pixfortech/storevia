// The store's logo and favicon (final pass, Phase 2A) against the database:
// only a READY, undeleted image of this store can be used (another store's
// or tenant's media reads as missing), design.edit to change them, every
// change audited and invalidating the store's pages (store.changed), and
// the storefront reading them only while they are READY in the store.
import { deleteMedia } from "@storevia/media";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { getStoreBranding, setStoreBrandImage } from "@storevia/site-admin";
import type { StoreContext } from "@storevia/tenancy";
import { toTypeId } from "@storevia/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readStorefront, type CartStore } from "../src/storefront";
import { expectCode, makeTenant, memberContext, storeOf, type Tenant } from "./fixtures";

let a: Tenant;
let A: StoreContext; // the store being branded
let A2: StoreContext; // another store of the same organisation
let B: StoreContext; // another organisation's store

const scopeOf = (s: StoreContext): CartStore => ({
  organisationId: s.organisationId,
  storeId: s.storeId,
  currency: "INR",
});
const identity = (s: StoreContext) => readStorefront(scopeOf(s), (r) => r.identity());

/** A media row as the pipeline leaves it (renditions are servable keys). */
async function media(
  s: StoreContext,
  options: {
    status?: string;
    kind?: string;
    width?: number;
    height?: number;
    deleted?: boolean;
  } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const key = (name: string) => `${s.organisationId}/${s.storeId}/${id}/${name}`;
  const renditions = [320, 640]
    .filter((w) => w <= width)
    .map((w) => ({
      key: key(`w${String(w)}.webp`),
      width: w,
      height: Math.round((height * w) / width),
      format: "webp",
      bytes: 1000,
    }));
  const status = options.deleted ? "DELETED" : (options.status ?? "READY");
  await migratorDb().$executeRaw`
    INSERT INTO "MediaAsset" (id, "organisationId", "storeId", kind, status, filename,
        "declaredMimeType", "mimeType", width, height, "storageKey", renditions, "deletedAt", "updatedAt")
    VALUES (${id}::uuid, ${s.organisationId}::uuid, ${s.storeId}::uuid,
            ${options.kind ?? "IMAGE"}::"MediaKind", ${status}::"MediaStatus", 'brand.png',
            'image/png', 'image/png', ${width}, ${height}, ${key("original.png")},
            ${JSON.stringify(status === "READY" || status === "DELETED" ? renditions : [])}::jsonb,
            ${options.deleted ? new Date() : null}, now())`;
  return toTypeId("media", id);
}

const storeColumns = async (s: StoreContext) =>
  migratorDb().store.findUniqueOrThrow({
    where: { id: s.storeId },
    select: { logoMediaId: true, faviconMediaId: true },
  });

const events = (s: StoreContext) =>
  migratorDb().outboxEvent.findMany({
    where: { storeId: s.storeId, type: "store.changed" },
    select: { type: true },
  });

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("brand-a", { stores: [{ currency: "INR" }, { currency: "INR" }] });
  A = storeOf(a, 0);
  A2 = storeOf(a, 1);
  B = storeOf(await makeTenant("brand-b"));
});

afterAll(disconnectTestClients);

describe("setting and removing the logo and favicon", () => {
  it("a store without either shows its name and the browser's default icon", async () => {
    expect(await getStoreBranding(A)).toEqual({ logoMediaId: null, faviconMediaId: null });
    expect(await identity(A)).toMatchObject({ logo: null, favicon: null });
  });

  it("sets both, audited, invalidating the store's pages; the storefront reads them", async () => {
    const logo = await media(A, { width: 1200, height: 300 });
    const favicon = await media(A, { width: 512, height: 512 });
    await migratorDb().outboxEvent.deleteMany({ where: { storeId: A.storeId } });

    expect(await setStoreBrandImage(A, { slot: "logo", mediaId: logo })).toEqual({
      logoMediaId: logo,
      faviconMediaId: null,
    });
    expect(await setStoreBrandImage(A, { slot: "favicon", mediaId: favicon })).toEqual({
      logoMediaId: logo,
      faviconMediaId: favicon,
    });
    expect(await getStoreBranding(A)).toEqual({ logoMediaId: logo, faviconMediaId: favicon });
    expect(await events(A)).toHaveLength(2);

    const shown = await identity(A);
    expect(shown?.logo?.url).toMatch(/\/w640\.webp$/);
    expect(shown?.logo?.srcSet).toMatch(/w320\.webp 320w, .+w640\.webp 640w$/);
    expect(shown?.favicon?.srcSet).toMatch(/w320\.webp 320w/);

    const audit = await migratorDb().auditLog.findMany({
      where: { storeId: A.storeId, action: { startsWith: "store.logo_" } },
      select: { action: true, metadata: true },
    });
    expect(audit).toEqual([{ action: "store.logo_set", metadata: { mediaId: logo } }]);

    // The same image again changes nothing and records nothing.
    await setStoreBrandImage(A, { slot: "logo", mediaId: logo });
    expect(await events(A)).toHaveLength(2);
    expect(
      await migratorDb().auditLog.count({
        where: { storeId: A.storeId, action: { startsWith: "store.logo_" } },
      }),
    ).toBe(1);
  });

  it("replaces and removes; the storefront falls back to the name and default icon", async () => {
    const before = await getStoreBranding(A);
    const replacement = await media(A, { width: 640, height: 200 });
    await setStoreBrandImage(A, { slot: "logo", mediaId: replacement });
    const replaced = await migratorDb().auditLog.findFirstOrThrow({
      where: { storeId: A.storeId, action: "store.logo_set" },
      orderBy: { createdAt: "desc" },
    });
    expect(replaced.metadata).toEqual({
      mediaId: replacement,
      previousMediaId: before.logoMediaId,
    });

    await setStoreBrandImage(A, { slot: "logo", mediaId: null });
    await setStoreBrandImage(A, { slot: "favicon", mediaId: null });
    expect(await storeColumns(A)).toEqual({ logoMediaId: null, faviconMediaId: null });
    expect(await identity(A)).toMatchObject({ logo: null, favicon: null });
    expect(
      await migratorDb().auditLog.count({
        where: {
          storeId: A.storeId,
          action: { in: ["store.logo_removed", "store.favicon_removed"] },
        },
      }),
    ).toBe(2);
    // Removing what isn't there is a no-op.
    const count = (await events(A)).length;
    await setStoreBrandImage(A, { slot: "logo", mediaId: null });
    expect(await events(A)).toHaveLength(count);
  });
});

describe("what can't be used", () => {
  it("another tenant's or another store's media reads as missing", async () => {
    const foreign = await media(B);
    const sibling = await media(A2);
    for (const mediaId of [foreign, sibling]) {
      await expectCode(setStoreBrandImage(A, { slot: "logo", mediaId }), "NOT_FOUND");
      await expectCode(setStoreBrandImage(A, { slot: "favicon", mediaId }), "NOT_FOUND");
    }
    // Malformed or wrong-kind ids too.
    for (const mediaId of ["media_nope", toTypeId("product", crypto.randomUUID()), ""]) {
      await expectCode(setStoreBrandImage(A, { slot: "logo", mediaId }), "NOT_FOUND");
    }
    expect(await storeColumns(A)).toEqual({ logoMediaId: null, faviconMediaId: null });
    // B's own store can use its own image.
    await setStoreBrandImage(B, { slot: "logo", mediaId: foreign });
    expect((await identity(B))?.logo).not.toBeNull();
    expect((await identity(A))?.logo).toBeNull();
  });

  it("only READY, undeleted images with renditions; a favicon close to square", async () => {
    await expectCode(
      setStoreBrandImage(A, { slot: "logo", mediaId: await media(A, { status: "PROCESSING" }) }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      setStoreBrandImage(A, {
        slot: "logo",
        mediaId: await media(A, { status: "PENDING_UPLOAD" }),
      }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      setStoreBrandImage(A, { slot: "favicon", mediaId: await media(A, { status: "REJECTED" }) }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      setStoreBrandImage(A, { slot: "logo", mediaId: await media(A, { deleted: true }) }),
      "NOT_FOUND",
    );
    await expectCode(
      setStoreBrandImage(A, { slot: "logo", mediaId: await media(A, { kind: "DOCUMENT" }) }),
      "VALIDATION_FAILED",
    );
    const wide = await media(A, { width: 1000, height: 200 });
    await expectCode(
      setStoreBrandImage(A, { slot: "favicon", mediaId: wide }),
      "VALIDATION_FAILED",
    );
    // A wide image is a fine logo.
    await setStoreBrandImage(A, { slot: "logo", mediaId: wide });
    // Unknown slots and extra fields are refused.
    await expectCode(setStoreBrandImage(A, { slot: "banner", mediaId: wide }), "VALIDATION_FAILED");
    await expectCode(
      setStoreBrandImage(A, { slot: "logo", mediaId: wide, storeId: B.storeId }),
      "VALIDATION_FAILED",
    );
    await setStoreBrandImage(A, { slot: "logo", mediaId: null });
  });

  it("design.edit to change or see them; archived stores are read-only", async () => {
    const image = await media(A);
    for (const role of ["VIEWER", "CATALOGUE_MANAGER", "ORDER_MANAGER", "SUPPORT"] as const) {
      const member = await memberContext(a, role, A);
      await expectCode(setStoreBrandImage(member, { slot: "logo", mediaId: image }), "FORBIDDEN");
      await expectCode(getStoreBranding(member), "FORBIDDEN");
    }
    const designer = await memberContext(a, "DESIGNER", A);
    await setStoreBrandImage(designer, { slot: "favicon", mediaId: image });
    expect((await getStoreBranding(A)).faviconMediaId).toBe(image);
    await expectCode(
      setStoreBrandImage({ ...A, storeStatus: "ARCHIVED" }, { slot: "logo", mediaId: image }),
      "CONFLICT",
    );
    await setStoreBrandImage(designer, { slot: "favicon", mediaId: null });
  });
});

describe("while an image is the store's logo or favicon", () => {
  it("it can't be deleted, and the storefront only shows it while it is READY", async () => {
    const image = await media(A);
    await setStoreBrandImage(A, { slot: "logo", mediaId: image });
    await expectCode(deleteMedia(A, image), "CONFLICT");
    expect((await identity(A))?.logo).not.toBeNull();

    // Should the asset ever stop being READY (a platform action), the name shows again.
    const id = (await storeColumns(A)).logoMediaId ?? "";
    await migratorDb().mediaAsset.update({ where: { id }, data: { status: "PROCESSING" } });
    expect((await identity(A))?.logo).toBeNull();
    await migratorDb().mediaAsset.update({ where: { id }, data: { status: "READY" } });
    expect((await identity(A))?.logo).not.toBeNull();

    // The database keeps the reference inside the store whatever the path.
    const foreign = (
      await migratorDb().mediaAsset.findFirstOrThrow({
        where: { storeId: B.storeId },
        select: { id: true },
      })
    ).id;
    await expect(
      migratorDb().store.update({ where: { id: A.storeId }, data: { logoMediaId: foreign } }),
    ).rejects.toThrow();
  });
});
