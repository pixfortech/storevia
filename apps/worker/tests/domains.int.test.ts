// The custom-domain verification job (ADR-0032 §5) against PostgreSQL with
// the real worker role and the deterministic local provider.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { MONITOR_FAILURE_LIMIT, ownershipRecordValue } from "@storevia/domains";
import { LocalProvisioner, simulateDns } from "@storevia/domains/provisioner";
import { createLogger } from "@storevia/observability";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { domainVerifyJob } from "../src/domains";

process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";
process.env["DOMAIN_HOSTING_PROVIDER"] = "local";

const ctx = {
  slot: new Date(),
  attempt: 1,
  signal: new AbortController().signal,
  log: createLogger({ test: "worker-domains" }),
};

const HOUR = 3600_000;
let statePath: string;
let orgId: string;
let storeId: string;

async function domain(
  hostname: string,
  data: {
    status?: "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";
    isPrimary?: boolean;
    lastCheckedAt?: Date | null;
    checkAttempts?: number;
    type?: "CUSTOM" | "PLATFORM_SUBDOMAIN";
  } = {},
) {
  const token = crypto.randomUUID().replaceAll("-", "") + "x".repeat(11);
  return migratorDb().storeDomain.create({
    data: {
      organisationId: orgId,
      storeId,
      hostname,
      type: data.type ?? "CUSTOM",
      status: data.status ?? "PENDING",
      isPrimary: data.isPrimary ?? false,
      verificationToken: token,
      lastCheckedAt: data.lastCheckedAt ?? null,
      checkAttempts: data.checkAttempts ?? 0,
      ...(data.status === "ACTIVE" ? { verifiedAt: new Date() } : {}),
    },
  });
}

const row = (hostname: string) =>
  migratorDb().storeDomain.findUniqueOrThrow({ where: { hostname } });

function pointDns(hostname: string, token: string) {
  simulateDns(hostname, { txt: [ownershipRecordValue(token)], routed: true }, statePath);
}

beforeEach(async () => {
  await truncateAll();
  statePath = join(mkdtempSync(join(tmpdir(), "storevia-worker-domains-")), "state.json");
  process.env["DOMAIN_PROVIDER_LOCAL_STATE"] = statePath;
  const db = migratorDb();
  orgId = (await db.organisation.create({ data: { name: "Acme" } })).id;
  storeId = (
    await db.store.create({
      data: {
        organisationId: orgId,
        name: "Clay",
        slug: "clay",
        status: "ACTIVE",
        currency: "INR",
        locale: "en-IN",
        timezone: "Asia/Kolkata",
        country: "IN",
      },
    })
  ).id;
  await domain("clay.storevia.site", {
    type: "PLATFORM_SUBDOMAIN",
    status: "ACTIVE",
    isPrimary: true,
  });
});

afterAll(disconnectTestClients);

describe("domains.verify", () => {
  it("registers new domains, activates verified ones, and audits as SYSTEM", async () => {
    const ready = await domain("ready.test");
    await domain("waiting.test");
    pointDns("ready.test", ready.verificationToken);

    expect(await domainVerifyJob.run(ctx)).toEqual({
      checked: 2,
      activated: 1,
      failed: 0,
      providerErrors: 0,
      provider: "local",
    });
    expect(await row("ready.test")).toMatchObject({
      status: "ACTIVE",
      checkAttempts: 0,
      failureReason: null,
      providerRef: "local:ready.test",
    });
    expect((await row("ready.test")).verifiedAt).not.toBeNull();
    expect(await row("waiting.test")).toMatchObject({
      status: "VERIFYING",
      checkAttempts: 1,
      failureReason: "dns_txt_missing",
    });
    const provider = new LocalProvisioner(statePath);
    expect((await provider.getDomainStatus("waiting.test")).registered).toBe(true);
    const audit = await migratorDb().auditLog.findMany({ where: { action: "domain.verified" } });
    expect(audit).toMatchObject([{ actorType: "SYSTEM", actorId: null, organisationId: orgId }]);

    // Nothing is due a second later: the backoff and the monitoring interval hold.
    expect(await domainVerifyJob.run(ctx)).toMatchObject({ checked: 0 });
  });

  it("checks waiting domains on a backoff and active ones every few hours", async () => {
    await domain("fresh.test", {
      status: "VERIFYING",
      checkAttempts: 3,
      lastCheckedAt: new Date(),
    });
    await domain("due.test", {
      status: "VERIFYING",
      checkAttempts: 3,
      lastCheckedAt: new Date(Date.now() - 2 * 60_000),
    });
    await domain("slow.test", {
      status: "VERIFYING",
      checkAttempts: 50,
      lastCheckedAt: new Date(Date.now() - 60 * 60_000),
    });
    await domain("monitored.test", {
      status: "ACTIVE",
      lastCheckedAt: new Date(Date.now() - 7 * HOUR),
    });
    await domain("recent.test", { status: "ACTIVE", lastCheckedAt: new Date(Date.now() - HOUR) });
    await domain("failed.test", {
      status: "FAILED",
      lastCheckedAt: new Date(Date.now() - 99 * HOUR),
    });
    const result = await domainVerifyJob.run(ctx);
    expect(result).toMatchObject({ checked: 2 });
    expect((await row("due.test")).checkAttempts).toBe(4);
    expect((await row("monitored.test")).failureReason).toBe("dns_lost");
    expect((await row("fresh.test")).checkAttempts).toBe(3);
    expect((await row("slow.test")).checkAttempts).toBe(50);
    expect((await row("failed.test")).status).toBe("FAILED");
  });

  it("a primary that fails for good hands primary back to the platform address", async () => {
    await migratorDb().storeDomain.updateMany({
      where: { hostname: "clay.storevia.site" },
      data: { isPrimary: false },
    });
    await domain("gone.test", {
      status: "ACTIVE",
      isPrimary: true,
      checkAttempts: MONITOR_FAILURE_LIMIT - 1,
      lastCheckedAt: new Date(Date.now() - 7 * HOUR),
    });
    expect(await domainVerifyJob.run(ctx)).toMatchObject({ checked: 1, failed: 1 });
    expect(await row("gone.test")).toMatchObject({
      status: "FAILED",
      isPrimary: false,
      failureReason: "dns_lost",
    });
    expect((await row("clay.storevia.site")).isPrimary).toBe(true);
    const actions = (await migratorDb().auditLog.findMany({ orderBy: { createdAt: "asc" } })).map(
      (a) => [a.action, a.actorType],
    );
    expect(actions).toEqual([
      ["domain.failed", "SYSTEM"],
      ["domain.primary_changed", "SYSTEM"],
    ]);
  });

  it("a provider outage never takes an ACTIVE domain down", async () => {
    await domain("provider-error.shop.test", {
      status: "ACTIVE",
      isPrimary: false,
      checkAttempts: MONITOR_FAILURE_LIMIT - 1,
      lastCheckedAt: new Date(Date.now() - 7 * HOUR),
    });
    expect(await domainVerifyJob.run(ctx)).toMatchObject({ checked: 1, providerErrors: 1 });
    expect(await row("provider-error.shop.test")).toMatchObject({
      status: "ACTIVE",
      checkAttempts: MONITOR_FAILURE_LIMIT - 1,
    });
  });

  it("two workers never check the same domain at once", async () => {
    for (let i = 0; i < 6; i++) await domain(`d${String(i)}.test`);
    const [a, b] = await Promise.all([domainVerifyJob.run(ctx), domainVerifyJob.run(ctx)]);
    expect((a?.["checked"] as number) + (b?.["checked"] as number)).toBe(6);
    const rows = await migratorDb().storeDomain.findMany({ where: { type: "CUSTOM" } });
    expect(rows.every((r) => r.checkAttempts === 1)).toBe(true);
  });
});
