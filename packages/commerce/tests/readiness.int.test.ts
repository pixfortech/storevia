// Launch readiness (final pass, DB-1): what an online store needs before it
// goes live, read against the database, and enforced when it goes live.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { withTenant } from "@storevia/database";
import {
  getOnlineStore,
  launchBlockers,
  launchReadiness,
  scopeOf,
  setStorefrontLive,
  updateStore,
  type LaunchCheck,
  type StoreContext,
} from "@storevia/tenancy";
import { siteLaunchChecks } from "@storevia/site-admin";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  commerceLaunchChecks,
  connectTestPayments,
  createProduct,
  createShippingRate,
  createShippingZone,
} from "../src";
import { expectCode, makeTenant, memberContext, storeOf, type Tenant } from "./fixtures";

let a: Tenant;
let b: Tenant;

const checksFor = (ctx: StoreContext) => (tx: Parameters<typeof commerceLaunchChecks>[0]) =>
  commerceLaunchChecks(tx, ctx.storeId);
const read = (ctx: StoreContext) => launchReadiness(ctx, checksFor(ctx));
const byKey = (checks: readonly LaunchCheck[]) => new Map(checks.map((c) => [c.key, c]));

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("ready-a");
  b = await makeTenant("ready-b");
});

afterAll(disconnectTestClients);

describe("launch readiness", () => {
  it("a new online store lists exactly what is missing, and can't go live", async () => {
    const s = storeOf(a);
    const checks = byKey(await read(s));
    expect(checks.get("payments")).toMatchObject({ ok: false, blocking: true });
    expect(checks.get("payments")?.detail).toMatch(/Connect a payment provider/);
    expect(checks.get("products")).toMatchObject({ ok: false, blocking: true });
    expect(checks.get("identity")).toMatchObject({ ok: false, blocking: true });
    // No products yet, so no shipping check.
    expect(checks.has("shipping")).toBe(false);
    const refused = await setStorefrontLive(s, true, checksFor(s)).catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: "CONFLICT" });
    expect((refused as Error).message).toMatch(/payment provider/);
    expect((await getOnlineStore(s)).status).toBe("DRAFT");
  });

  it("a shippable product needs a shipping zone with a country and an active rate", async () => {
    const s = storeOf(a);
    await createProduct(s, { title: "Mug", price: "400", initialStock: 5, status: "ACTIVE" });
    let checks = byKey(await read(s));
    expect(checks.get("products")).toMatchObject({ ok: true });
    expect(checks.get("shipping")).toMatchObject({ ok: false, blocking: true });
    const { zoneId } = await createShippingZone(s, { name: "India", countries: "IN" });
    // A zone without a rate still can't ship.
    expect(byKey(await read(s)).get("shipping")?.ok).toBe(false);
    await createShippingRate(s, zoneId, { name: "Standard", type: "FLAT", amount: "40" });
    checks = byKey(await read(s));
    expect(checks.get("shipping")).toMatchObject({ ok: true });
  });

  it("test payments are a warning, not a blocker; contact details are required", async () => {
    const s = storeOf(a);
    await connectTestPayments(s);
    let checks = byKey(await read(s));
    expect(checks.get("payments")).toMatchObject({ ok: false, blocking: false });
    expect(checks.get("payments")?.detail).toMatch(/test mode/);
    expect(launchBlockers([...checks.values()]).map((c) => c.key)).toEqual(["identity"]);
    await expectCode(setStorefrontLive(s, true, checksFor(s)), "CONFLICT");

    await updateStore(s, {
      name: "Clay Studio",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      contactEmail: "",
      supportEmail: "help@clay.example",
    });
    checks = byKey(await read(s));
    expect(checks.get("identity")).toMatchObject({ ok: true });
    expect(checks.get("identity")?.detail).toContain("help@clay.example");
    await setStorefrontLive(s, true, checksFor(s));
    expect((await getOnlineStore(s)).status).toBe("ACTIVE");
  });

  it("a live payment connection passes; one without credentials doesn't", async () => {
    const s = storeOf(a);
    const db = migratorDb();
    await db.paymentProviderConnection.updateMany({
      where: { storeId: s.storeId },
      data: { status: "DISABLED" },
    });
    const live = await db.paymentProviderConnection.create({
      data: {
        organisationId: s.organisationId,
        storeId: s.storeId,
        provider: "razorpay",
        mode: "LIVE",
        status: "ACTIVE",
        credentialsCiphertext: Buffer.from("sealed"),
        keyVersion: 1,
      },
    });
    expect(byKey(await read(s)).get("payments")).toMatchObject({ ok: true, blocking: true });
    await db.paymentProviderConnection.update({
      where: { id: live.id },
      data: { credentialsCiphertext: null, keyVersion: null },
    });
    expect(byKey(await read(s)).get("payments")).toMatchObject({ ok: false, blocking: true });
  });

  it("the page system's check: a published home page", async () => {
    const s = storeOf(a);
    const site = (ctx: StoreContext) =>
      withTenant(scopeOf(ctx), (tx) => siteLaunchChecks(tx, ctx.storeId));
    const home = await migratorDb().page.findFirst({
      where: { storeId: s.storeId, kind: "HOME", deletedAt: null },
    });
    // Every store is created with its home page published (ADR-0030).
    expect(home?.publishedVersionId).toBeTruthy();
    expect(await site(s)).toEqual([expect.objectContaining({ key: "home", ok: true })]);
    // The database keeps a store's home page published (a published version
    // is always pointed at). A store whose home page can't be read (here,
    // another store's, outside the scope) fails the check rather than passing.
    const elsewhere = await withTenant(scopeOf(storeOf(b)), (tx) =>
      siteLaunchChecks(tx, s.storeId),
    );
    expect(elsewhere).toEqual([
      expect.objectContaining({ key: "home", ok: false, blocking: true }),
    ]);
  });

  it("other business types have no commerce checks", async () => {
    const s = storeOf(b);
    await migratorDb().store.update({
      where: { id: s.storeId },
      data: { businessType: "PORTFOLIO" },
    });
    expect(await read(s)).toEqual([]);
  });

  it("tenancy: the checks read only the store in scope", async () => {
    const s = storeOf(b);
    // Store A's product, zone and connection are invisible from store B's scope.
    const checks = await withTenant(scopeOf(s), (tx) =>
      commerceLaunchChecks(tx, storeOf(a).storeId),
    );
    expect(checks).toEqual([]);
  });

  it("anyone who reads the store sees the list; going live needs store.update", async () => {
    const s = storeOf(a);
    const viewer = await memberContext(a, "VIEWER", s);
    expect((await read(viewer)).length).toBeGreaterThan(0);
    await expectCode(setStorefrontLive(viewer, true, checksFor(viewer)), "FORBIDDEN");
  });
});
