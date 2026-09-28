// Media sweep (M8) with the real worker role.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { setMediaStorageForTests } from "@storevia/media";
import type { ObjectStorage } from "@storevia/media/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sweepMedia } from "../src/media";

const ORG = "0190f2a4-0000-7000-8000-00000000d001";
const STORE = "0190f2a4-0000-7000-8000-00000000d002";
const deleted: string[] = [];

beforeEach(async () => {
  await truncateAll();
  deleted.length = 0;
  setMediaStorageForTests({
    delete: (key: string) => {
      deleted.push(key);
      return Promise.resolve();
    },
  } as unknown as ObjectStorage);
  const db = migratorDb();
  await db.$executeRaw`INSERT INTO "Organisation" (id, name, "updatedAt") VALUES (${ORG}::uuid, 'Org', now())`;
  await db.$executeRaw`
    INSERT INTO "Store" (id, "organisationId", name, slug, status, currency, locale, timezone, country, "updatedAt")
    VALUES (${STORE}::uuid, ${ORG}::uuid, 'Shop', 'shop', 'ACTIVE', 'INR', 'en-IN', 'Asia/Kolkata', 'IN', now())`;
});

afterAll(async () => {
  setMediaStorageForTests(undefined);
  await disconnectTestClients();
});

async function asset(status: string, ageMinutes: number): Promise<string> {
  const id = crypto.randomUUID();
  const at = new Date(Date.now() - ageMinutes * 60_000);
  await migratorDb().$executeRaw`
    INSERT INTO "MediaAsset" (id, "organisationId", "storeId", kind, status, filename, "declaredMimeType",
      "storageKey", "createdAt", "updatedAt")
    VALUES (${id}::uuid, ${ORG}::uuid, ${STORE}::uuid, 'IMAGE', ${status}::"MediaStatus", 'a.jpg',
      'image/jpeg', ${`uploads/${ORG}/${STORE}/${id}`}, ${at}, ${at})`;
  return id;
}

const statusOf = async (id: string) =>
  (await migratorDb().mediaAsset.findUniqueOrThrow({ where: { id } })).status;

describe("media sweep", () => {
  it("rejects interrupted processing and abandoned uploads, removing their raw uploads", async () => {
    const stuck = await asset("PROCESSING", 20);
    const working = await asset("PROCESSING", 2);
    const abandoned = await asset("PENDING_UPLOAD", 90);
    const uploading = await asset("PENDING_UPLOAD", 5);
    const ready = await asset("READY", 600);

    expect(await sweepMedia()).toEqual({ stuck: 1, abandoned: 1 });
    expect(await statusOf(stuck)).toBe("REJECTED");
    expect(await statusOf(abandoned)).toBe("REJECTED");
    expect(await statusOf(working)).toBe("PROCESSING");
    expect(await statusOf(uploading)).toBe("PENDING_UPLOAD");
    expect(await statusOf(ready)).toBe("READY");
    expect(deleted.sort()).toEqual(
      [`uploads/${ORG}/${STORE}/${stuck}`, `uploads/${ORG}/${STORE}/${abandoned}`].sort(),
    );
    // Idempotent.
    expect(await sweepMedia()).toEqual({ stuck: 0, abandoned: 0 });
  });
});

describe("operations snapshot (M8)", () => {
  it("reports platform-wide aggregates, including jobs nobody is running", async () => {
    const { operationsSnapshot } = await import("../src/ops");
    // The store's creation queued its own events; start from none.
    await migratorDb().$executeRaw`UPDATE "OutboxEvent" SET "dispatchedAt" = now()`;
    const empty = await operationsSnapshot();
    expect(Object.keys(empty).sort()).toEqual(
      [
        "domains_failed",
        "jobs_failing",
        "jobs_overdue",
        "media_processing",
        "messages_unannounced_oldest_seconds",
        "notifications_failed",
        "notifications_oldest_pending_seconds",
        "notifications_pending",
        "outbox_backlog",
        "outbox_oldest_seconds",
        "payment_webhooks_failed",
      ].sort(),
    );
    expect(Object.values(empty).every((v) => v === 0)).toBe(true);

    await migratorDb().scheduledJob.create({
      data: {
        name: "test.stalled",
        intervalSeconds: 60,
        slot: new Date(Date.now() - 3600_000),
        nextRunAt: new Date(Date.now() - 3600_000),
        consecutiveFailures: 4,
      },
    });
    await asset("PROCESSING", 1);
    const after = await operationsSnapshot();
    expect(after).toMatchObject({ jobs_overdue: 1, jobs_failing: 1, media_processing: 1 });
  });

  it("the platform role can read the aggregates but not the tables behind them", async () => {
    const { platformDb } = await import("@storevia/database/platform");
    const rows = await platformDb().$queryRaw<{ metric: string }[]>`
      SELECT metric FROM app_operations_snapshot()`;
    expect(rows.length).toBe(11);
    await expect(platformDb().$queryRaw`SELECT count(*) FROM "OrderNotification"`).rejects.toThrow(
      /permission denied/,
    );
  });
});
