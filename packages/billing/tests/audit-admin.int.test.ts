// Platform audit log viewer (M8): every tenant and platform-level entry,
// paged, filterable, masked; staff without platform.audit.read see nothing.
import { disconnectTestClients, migratorDb } from "@storevia/database/testing";
import { createOrganisation, type Principal } from "@storevia/tenancy";
import { requirePlatformStaff, type PlatformContext } from "@storevia/tenancy/platform";
import { uuidv7 } from "@storevia/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listPlatformAuditLog } from "../src/audit-admin";

async function makeUser(label: string): Promise<Principal> {
  const email = `${label}-${uuidv7()}@example.test`;
  const user = await migratorDb().user.create({
    data: { id: uuidv7(), email, name: `User ${label}`, emailVerified: true },
  });
  return {
    userId: user.id,
    email,
    name: user.name,
    emailVerified: true,
    recentlyAuthenticated: false,
  };
}

async function staff(role: "SUPPORT" | "READ_ONLY"): Promise<PlatformContext> {
  const user = await makeUser(role.toLowerCase());
  await migratorDb().platformStaff.create({ data: { userId: user.userId, role } });
  return requirePlatformStaff(user, { requestId: "req-audit" });
}

let support: PlatformContext;
let readOnly: PlatformContext;
let orgA: string;
let orgB: string;
let owner: Principal;

beforeAll(async () => {
  support = await staff("SUPPORT");
  readOnly = await staff("READ_ONLY");
  owner = await makeUser("audit-owner");
  orgA = (await createOrganisation(owner, { name: "Audit Org A" })).organisationId;
  orgB = (await createOrganisation(await makeUser("audit-b"), { name: "Audit Org B" }))
    .organisationId;
  const base = Date.now() + 60_000;
  // 70 entries in A sharing timestamps in pairs, plus a platform-level one.
  await migratorDb().auditLog.createMany({
    data: [
      ...Array.from({ length: 70 }, (_, i) => ({
        id: uuidv7(),
        organisationId: orgA,
        actorType: "USER" as const,
        actorId: owner.userId,
        action: "member.invited",
        createdAt: new Date(base + Math.floor(i / 2) * 1000),
        ipAddress: "198.51.100.23",
        userAgent: "secret-agent",
        requestId: `req-${String(i)}`,
        metadata: { email: "invitee.person@example.test", role: "VIEWER" },
      })),
      {
        id: uuidv7(),
        organisationId: null,
        actorType: "PLATFORM_STAFF" as const,
        actorId: support.userId,
        action: "auth.platform.mfa_verified",
        createdAt: new Date(base + 100_000),
        metadata: { method: "totp" },
      },
    ],
  });
});

afterAll(disconnectTestClients);

describe("listPlatformAuditLog", () => {
  it("pages through an organisation's entries exactly once", async () => {
    const expected = await migratorDb().auditLog.count({ where: { organisationId: orgA } });
    const seen: string[] = [];
    let before: string | null = null;
    let pages = 0;
    do {
      const page = await listPlatformAuditLog(support, { organisationId: orgA, before });
      for (const e of page.entries) expect(e.organisation?.id).toBe(orgA);
      seen.push(...page.entries.map((e) => e.id));
      before = page.nextCursor;
      pages += 1;
    } while (before && pages < 10);
    expect(seen.length).toBe(expected);
    expect(new Set(seen).size).toBe(expected);
  });

  it("shows platform-level entries and names the staff actor", async () => {
    const page = await listPlatformAuditLog(support, { actor: "PLATFORM_STAFF", action: "auth." });
    const mfa = page.entries.find((e) => e.action === "auth.platform.mfa_verified");
    expect(mfa?.organisation).toBeNull();
    expect(mfa?.actorName).toBe("User support");
    expect(page.entries.every((e) => e.actorType === "PLATFORM_STAFF")).toBe(true);
  });

  it("masks emails and never returns IP addresses or user agents", async () => {
    const page = await listPlatformAuditLog(support, { organisationId: orgA });
    const text = JSON.stringify(page);
    expect(text).not.toContain("invitee.person@example.test");
    expect(text).toContain("i•••@example.test");
    expect(text).not.toContain("198.51.100.23");
    expect(text).not.toContain("secret-agent");
    expect(page.entries[0]?.metadata["role"]).toBe("VIEWER");
    expect(page.entries[0]?.organisation?.name).toBe("Audit Org A");
  });

  it("ignores malformed filters instead of failing or widening", async () => {
    const page = await listPlatformAuditLog(support, {
      organisationId: "' OR 1=1 --",
      action: "Robert'); DROP TABLE",
      before: "garbage",
    });
    expect(page.entries.length).toBeGreaterThan(0);
    const b = await listPlatformAuditLog(support, { organisationId: orgB });
    expect(b.entries.every((e) => e.organisation?.id === orgB)).toBe(true);
  });

  it("requires platform.audit.read", async () => {
    await expect(listPlatformAuditLog(readOnly)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
