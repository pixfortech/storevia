// The media library end to end with the local storage adapter: upload
// targets, completion (sniff, process, quota), rejection, tenant isolation,
// and deletion rules.
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withTenant } from "@storevia/database";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { getUsage } from "@storevia/entitlements";
import {
  createOrganisation,
  createStore,
  requireOrganisationAccess,
  requireStoreAccess,
  scopeOf,
  type Principal,
  type StoreContext,
} from "@storevia/tenancy";
import { parseTypeId, toTypeId, uuidv7, type DomainError } from "@storevia/types";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  completeMediaUpload,
  createMediaUpload,
  deleteMedia,
  getMedia,
  listMedia,
  LocalObjectStorage,
  setMediaStorageForTests,
  updateMediaAlt,
} from "../src";
import { uploadKey } from "../src/keys";

process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";
const root = mkdtempSync(join(tmpdir(), "storevia-media-int-"));
const storage = new LocalObjectStorage({
  root,
  uploadUrl: "http://app.localhost/api/media/upload",
  publicBaseUrl: "http://app.localhost/media",
  secret: "s".repeat(40),
});
setMediaStorageForTests(storage);

let n = 0;
async function makeStore(label: string): Promise<{ owner: Principal; store: StoreContext }> {
  n += 1;
  const user = await migratorDb().user.create({
    data: {
      id: uuidv7(),
      email: `${label}-${String(n)}@example.test`,
      name: label,
      emailVerified: true,
    },
  });
  const owner: Principal = {
    userId: user.id,
    email: user.email,
    name: label,
    emailVerified: true,
    recentlyAuthenticated: false,
  };
  const { organisationId } = await createOrganisation(owner, { name: `Org ${label}` });
  const org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
  const { storeId } = await createStore(org, {
    name: `Store ${label}`,
    slug: `${label}-${String(n)}`,
    currency: "INR",
    country: "IN",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
  });
  return { owner, store: await requireStoreAccess(owner, toTypeId("store", storeId)) };
}

/** What the browser does: POST the bytes to the upload target (here: the local route's check + write). */
async function upload(fields: Record<string, string>, bytes: Uint8Array): Promise<void> {
  const token = storage.verifyUploadToken(fields);
  if (!token) throw new Error("upload token refused");
  if (bytes.byteLength > token.maxBytes) throw new Error("too large");
  await storage.write(token.key, bytes);
}

const jpeg = (width = 800, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: "#3a6" } })
    .jpeg()
    .toBuffer()
    .then((b) => new Uint8Array(b));

/** A photo-like image (noise): re-encoding and renditions can't shrink it below its upload size. */
const noisyJpeg = (width: number, height: number) => {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = (i * 7919 + (i >> 5) * 104729) % 251;
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer()
    .then((b) => new Uint8Array(b));
};

async function uploadImage(store: StoreContext, bytes: Uint8Array, filename = "photo.jpg") {
  const { mediaId, upload: target } = await createMediaUpload(store, {
    filename,
    size: bytes.byteLength,
    contentType: "image/jpeg",
  });
  await upload(target.fields, bytes);
  return { mediaId, view: await completeMediaUpload(store, mediaId) };
}

const usage = (store: StoreContext) =>
  withTenant(scopeOf(store), (tx) => getUsage(tx, store.organisationId, "media_storage"));

const owner = (store: StoreContext) => ({
  organisationId: store.organisationId,
  storeId: store.storeId,
});

async function expectCode(promise: Promise<unknown>, code: DomainError["code"]): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

let A: StoreContext;
let B: StoreContext;

beforeEach(async () => {
  await truncateAll();
  A = (await makeStore("media-a")).store;
  B = (await makeStore("media-b")).store;
});

afterAll(async () => {
  setMediaStorageForTests(undefined);
  await disconnectTestClients();
});

describe("upload and completion", () => {
  it("processes an image into a clean original and renditions, and counts the stored bytes", async () => {
    const { mediaId, view } = await uploadImage(A, await jpeg(), "../../Summer photo.jpg");
    expect(view).toMatchObject({
      filename: "Summer photo.jpg",
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
    });
    expect(view.renditions.map((r) => r.width)).toEqual([320, 640, 800]);
    expect(view.thumbnailUrl).toMatch(/^http:\/\/app\.localhost\/media\/.+\/w320\.webp$/);
    const id = parseTypeId("media", mediaId) ?? "";
    const files = readdirSync(join(root, A.organisationId, A.storeId, id)).sort();
    expect(files).toEqual(["original.jpg", "w1280.webp", "w320.webp", "w640.webp"]);
    expect(await usage(A)).toBe(BigInt(view.storedBytes));
    const row = await migratorDb().mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("READY");
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("decides the type by bytes: an SVG named .jpg is rejected and its bytes removed", async () => {
    const svg = new Uint8Array(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
    );
    const { mediaId, upload: target } = await createMediaUpload(A, {
      filename: "innocent.jpg",
      size: svg.byteLength,
      contentType: "image/jpeg",
    });
    await upload(target.fields, svg);
    await expect(completeMediaUpload(A, mediaId)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: /SVG/,
    });
    const id = parseTypeId("media", mediaId) ?? "";
    expect((await migratorDb().mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe(
      "REJECTED",
    );
    expect(await storage.head(uploadKey({ ...owner(A), mediaId: id }))).toBeNull();
    expect(await usage(A)).toBe(0n);
  });

  it("refuses oversize declarations, a second completion and a missing upload", async () => {
    await expectCode(
      createMediaUpload(A, { filename: "big.jpg", size: 25 * 1024 * 1024 }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      createMediaUpload(A, { filename: "logo.svg", size: 100 }),
      "VALIDATION_FAILED",
    );
    const { mediaId } = await uploadImage(A, await jpeg(100, 100));
    await expectCode(completeMediaUpload(A, mediaId), "CONFLICT");
    const pending = await createMediaUpload(A, { filename: "never.jpg", size: 1000 });
    await expectCode(completeMediaUpload(A, pending.mediaId), "VALIDATION_FAILED");
  });

  it("enforces media_storage when the upload completes and cleans up on refusal", async () => {
    const db = migratorDb();
    const bytes = await noisyJpeg(1200, 900);
    // Room for the upload itself, but not for the original plus its renditions.
    const limit = bytes.byteLength + 10;
    const feature = await db.feature.findUniqueOrThrow({ where: { key: "media_storage" } });
    await db.organisationFeatureOverride.create({
      data: {
        organisationId: A.organisationId,
        featureId: feature.id,
        enabled: true,
        limit: BigInt(limit),
        reason: "test",
      },
    });
    // Declared size over the limit: refused before any upload.
    await expectCode(createMediaUpload(A, { filename: "a.jpg", size: limit + 1 }), "LIMIT_REACHED");
    // Declared within the limit, but the stored result doesn't fit: refused at completion.
    const { mediaId, upload: target } = await createMediaUpload(A, {
      filename: "a.jpg",
      size: bytes.byteLength,
    });
    await upload(target.fields, bytes);
    await expectCode(completeMediaUpload(A, mediaId), "LIMIT_REACHED");
    const id = parseTypeId("media", mediaId) ?? "";
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
    expect(readdirSync(join(root, A.organisationId, A.storeId, id))).toEqual([]);
    expect(await usage(A)).toBe(0n);
  });
});

describe("upload targets (security review)", () => {
  it("accept only the declared size, at a never-served key", async () => {
    const bytes = await jpeg(100, 100);
    const { mediaId, upload: target } = await createMediaUpload(A, {
      filename: "a.jpg",
      size: bytes.byteLength,
    });
    const id = parseTypeId("media", mediaId) ?? "";
    expect(target.maxBytes).toBe(bytes.byteLength);
    expect(target.fields["key"]).toBe(uploadKey({ ...owner(A), mediaId: id }));
    await expect(upload(target.fields, new Uint8Array(bytes.byteLength + 1))).rejects.toThrow(
      /too large/,
    );
  });

  it("cap the uploads a store can leave unfinished", async () => {
    for (let i = 0; i < 20; i += 1) {
      await createMediaUpload(A, { filename: `p${String(i)}.jpg`, size: 10 });
    }
    await expectCode(createMediaUpload(A, { filename: "one-more.jpg", size: 10 }), "RATE_LIMITED");
    await createMediaUpload(B, { filename: "other-store.jpg", size: 10 });
  });

  it("deleting or failing an unfinished upload doesn't free its slot", async () => {
    // Its upload target stays valid until it expires, so a slot freed early
    // would let a store post raw bytes nothing meters (review follow-up).
    const started = [];
    for (let i = 0; i < 20; i += 1) {
      started.push(await createMediaUpload(A, { filename: `p${String(i)}.jpg`, size: 10 }));
    }
    await deleteMedia(A, started[0]?.mediaId ?? "");
    await expectCode(completeMediaUpload(A, started[1]?.mediaId ?? ""), "VALIDATION_FAILED");
    await expectCode(createMediaUpload(A, { filename: "one-more.jpg", size: 10 }), "RATE_LIMITED");
  });

  it("end as REJECTED, with the upload removed, when storage fails mid-way", async () => {
    class FailingStorage extends LocalObjectStorage {
      override async write(key: string, body: Uint8Array): Promise<void> {
        if (key.includes("/original.")) throw new Error("disk full");
        return super.write(key, body);
      }
    }
    const failing = new FailingStorage({
      root,
      uploadUrl: "http://app.localhost/api/media/upload",
      publicBaseUrl: "http://app.localhost/media",
      secret: "s".repeat(40),
    });
    setMediaStorageForTests(failing);
    try {
      const bytes = await jpeg(100, 100);
      const { mediaId, upload: target } = await createMediaUpload(A, {
        filename: "a.jpg",
        size: bytes.byteLength,
      });
      await upload(target.fields, bytes);
      await expect(completeMediaUpload(A, mediaId)).rejects.toThrow(/disk full/);
      const id = parseTypeId("media", mediaId) ?? "";
      expect((await migratorDb().mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe(
        "REJECTED",
      );
      expect(await storage.head(uploadKey({ ...owner(A), mediaId: id }))).toBeNull();
    } finally {
      setMediaStorageForTests(storage);
    }
  });
});

describe("tenant isolation", () => {
  it("another tenant can't complete, read, list, edit or delete your media", async () => {
    const { mediaId } = await uploadImage(A, await jpeg(200, 200));
    const pending = await createMediaUpload(A, { filename: "p.jpg", size: 10 });
    await expectCode(completeMediaUpload(B, pending.mediaId), "NOT_FOUND");
    await expectCode(getMedia(B, mediaId), "NOT_FOUND");
    await expectCode(updateMediaAlt(B, mediaId, { altText: "pwned" }), "NOT_FOUND");
    await expectCode(deleteMedia(B, mediaId), "NOT_FOUND");
    expect((await listMedia(B)).items).toEqual([]);
    expect((await listMedia(A)).items.map((m) => m.id)).toEqual([mediaId]);
  });

  it("an upload token for one key can't write another tenant's key", async () => {
    const a = await createMediaUpload(A, { filename: "a.jpg", size: 10 });
    const b = await createMediaUpload(B, { filename: "b.jpg", size: 10 });
    expect(
      storage.verifyUploadToken({ ...a.upload.fields, key: b.upload.fields["key"] }),
    ).toBeNull();
  });
});

describe("library edits and deletion", () => {
  it("sets alt text, refuses deleting media in use, and releases quota on delete", async () => {
    const { mediaId, view } = await uploadImage(A, await jpeg(300, 300));
    await updateMediaAlt(A, mediaId, { altText: "Green swatch" });
    expect((await getMedia(A, mediaId)).altText).toBe("Green swatch");
    const id = parseTypeId("media", mediaId) ?? "";
    await migratorDb().store.update({ where: { id: A.storeId }, data: { logoMediaId: id } });
    await expect(deleteMedia(A, mediaId)).rejects.toMatchObject({
      code: "CONFLICT",
      message: /branding/,
    });
    await migratorDb().store.update({ where: { id: A.storeId }, data: { logoMediaId: null } });
    expect(await usage(A)).toBe(BigInt(view.storedBytes));
    await deleteMedia(A, mediaId);
    expect(await usage(A)).toBe(0n);
    await expectCode(getMedia(A, mediaId), "NOT_FOUND");
    expect(await migratorDb().mediaAsset.count({ where: { id } })).toBe(1);
    // The files go too: freeing the quota must not leave them served.
    expect(readdirSync(join(root, A.organisationId, A.storeId, id))).toEqual([]);
    for (const r of view.renditions) {
      const key = new URL(r.url).pathname.replace(/^\/media\//, "");
      expect(await storage.head(key), key).toBeNull();
    }
  });

  it("read-only roles can list but not upload", async () => {
    const user = await migratorDb().user.create({
      data: {
        id: uuidv7(),
        email: "viewer-media@example.test",
        name: "Viewer",
        emailVerified: true,
      },
    });
    await migratorDb().membership.create({
      data: {
        organisationId: A.organisationId,
        userId: user.id,
        role: "VIEWER",
        status: "ACTIVE",
        allStores: true,
      },
    });
    const viewer = await requireStoreAccess(
      {
        userId: user.id,
        email: user.email,
        name: "Viewer",
        emailVerified: true,
        recentlyAuthenticated: false,
      },
      toTypeId("store", A.storeId),
    );
    await listMedia(viewer);
    await expectCode(createMediaUpload(viewer, { filename: "x.jpg", size: 10 }), "FORBIDDEN");
  });
});
