import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_VERIFY_ATTEMPTS, MONITOR_FAILURE_LIMIT, ownershipRecordValue } from "../custom";
import { evaluateDomain, type DomainSnapshot } from "./evaluate";
import { LOCAL_ROUTING, LocalProvisioner, simulateDns, simulateExternalRemoval } from "./local";

// The verification step against the deterministic local provider.

let path: string;
let provider: LocalProvisioner;
const TOKEN = "t".repeat(43);

const snapshot = (overrides: Partial<DomainSnapshot> = {}): DomainSnapshot => ({
  hostname: "shop.abc.test",
  status: "PENDING",
  verificationToken: TOKEN,
  providerRef: null,
  checkAttempts: 0,
  failureReason: null,
  ...overrides,
});

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), "storevia-domains-")), "state.json");
  provider = new LocalProvisioner(path);
});

describe("evaluateDomain", () => {
  it("registers, then waits for the ownership record with both records to show", async () => {
    const outcome = await evaluateDomain(snapshot(), provider);
    expect(outcome).toMatchObject({
      status: "VERIFYING",
      providerRef: "local:shop.abc.test",
      failureReason: "dns_txt_missing",
      checkAttempts: 1,
      becameActive: false,
    });
    expect(outcome.dnsRecords).toEqual([
      {
        type: "TXT",
        name: "_storevia-verification.shop.abc.test",
        value: `storevia-verification=${TOKEN}`,
        purpose: "ownership",
      },
      { type: "CNAME", name: "shop.abc.test", value: LOCAL_ROUTING.cname, purpose: "routing" },
    ]);
  });

  it("needs the ownership record AND routing AND a certificate", async () => {
    simulateDns("shop.abc.test", { txt: [ownershipRecordValue(TOKEN)] }, path);
    expect(await evaluateDomain(snapshot(), provider)).toMatchObject({
      status: "VERIFYING",
      failureReason: "dns_routing_missing",
    });
    simulateDns(
      "shop.abc.test",
      { txt: [ownershipRecordValue(TOKEN)], routed: true, certificate: "pending" },
      path,
    );
    expect(await evaluateDomain(snapshot(), provider)).toMatchObject({
      status: "VERIFYING",
      failureReason: "certificate_pending",
    });
    simulateDns("shop.abc.test", { txt: [ownershipRecordValue(TOKEN)], routed: true }, path);
    expect(await evaluateDomain(snapshot({ checkAttempts: 7 }), provider)).toMatchObject({
      status: "ACTIVE",
      failureReason: null,
      checkAttempts: 0,
      becameActive: true,
    });
  });

  it("routing alone doesn't prove ownership (a previous owner's record doesn't count)", async () => {
    simulateDns(
      "shop.abc.test",
      { txt: [ownershipRecordValue("p".repeat(43))], routed: true },
      path,
    );
    expect(await evaluateDomain(snapshot(), provider)).toMatchObject({
      status: "VERIFYING",
      failureReason: "dns_txt_missing",
    });
  });

  it("gives up after the verification budget, and a retry (attempts reset) starts again", async () => {
    const last = await evaluateDomain(
      snapshot({ status: "VERIFYING", checkAttempts: MAX_VERIFY_ATTEMPTS - 1 }),
      provider,
    );
    expect(last).toMatchObject({ status: "FAILED", failureReason: "verification_timeout" });
    const retry = await evaluateDomain(
      snapshot({ status: "VERIFYING", checkAttempts: 0 }),
      provider,
    );
    expect(retry.status).toBe("VERIFYING");
  });

  it("provider failures keep a new domain PENDING (retried) and never fail an ACTIVE one", async () => {
    const error = await evaluateDomain(snapshot({ hostname: "provider-error.abc.test" }), provider);
    expect(error).toMatchObject({
      status: "PENDING",
      failureReason: "provider_error",
      dnsRecords: null,
      providerError: "unavailable: provider returned 500",
    });
    const conflict = await evaluateDomain(
      snapshot({ hostname: "provider-conflict.abc.test" }),
      provider,
    );
    expect(conflict).toMatchObject({ status: "PENDING", failureReason: "provider_conflict" });
    const active = await evaluateDomain(
      snapshot({
        hostname: "provider-timeout.abc.test",
        status: "ACTIVE",
        checkAttempts: MONITOR_FAILURE_LIMIT,
      }),
      provider,
    );
    expect(active).toMatchObject({ status: "ACTIVE", checkAttempts: MONITOR_FAILURE_LIMIT });
  });

  it("an ACTIVE domain that loses DNS stays served, then fails after a persistent streak", async () => {
    await provider.addDomain("shop.abc.test");
    const lost = await evaluateDomain(snapshot({ status: "ACTIVE" }), provider);
    expect(lost).toMatchObject({ status: "ACTIVE", failureReason: "dns_lost", checkAttempts: 1 });
    const gone = await evaluateDomain(
      snapshot({ status: "ACTIVE", checkAttempts: MONITOR_FAILURE_LIMIT - 1 }),
      provider,
    );
    expect(gone).toMatchObject({ status: "FAILED", failureReason: "dns_lost" });
  });

  it("a domain removed at the provider behind Storevia's back is registered again", async () => {
    simulateDns("shop.abc.test", { txt: [ownershipRecordValue(TOKEN)], routed: true }, path);
    await provider.addDomain("shop.abc.test");
    simulateExternalRemoval("shop.abc.test", path);
    const outcome = await evaluateDomain(
      snapshot({ status: "ACTIVE", providerRef: "local:shop.abc.test" }),
      provider,
    );
    expect(outcome).toMatchObject({ status: "ACTIVE", failureReason: null });
    expect((await provider.getDomainStatus("shop.abc.test")).registered).toBe(true);
  });

  it("add and remove are idempotent", async () => {
    await provider.addDomain("shop.abc.test");
    await provider.addDomain("shop.abc.test");
    await provider.removeDomain("shop.abc.test");
    await provider.removeDomain("shop.abc.test");
    expect((await provider.getDomainStatus("shop.abc.test")).registered).toBe(false);
  });
});
