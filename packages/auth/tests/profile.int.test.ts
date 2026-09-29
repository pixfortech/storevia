import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cookieHeader, emailsTo, latestToken, noCookies } from "./helpers";
import { AuthService } from "../src";
import type { AuthSession } from "../src";

// Account profile (DB-4): name and email changes for the dashboard realm.

const dashboard = new AuthService({
  realm: "DASHBOARD",
  baseURL: "http://app.localhost:3001",
  secret: "test-dashboard-secret-0123456789abcdef",
});
const platform = new AuthService({
  realm: "PLATFORM",
  baseURL: "http://admin.localhost:3003",
  secret: "test-platform-secret-0123456789abcdef",
});

const PASSWORD = "correct horse battery";

async function registerVerified(email: string, name = "Test User"): Promise<void> {
  const signUp = await dashboard.signUp({ name, email, password: PASSWORD }, noCookies());
  expect(signUp.ok).toBe(true);
  const verified = await dashboard.verifyEmail(latestToken(email, "verify-email"), noCookies());
  expect(verified.ok).toBe(true);
}

async function signedIn(service: AuthService, email: string): Promise<Headers> {
  const result = await service.signIn({ email, password: PASSWORD }, noCookies());
  if (!result.ok) throw new Error(`sign-in failed: ${result.code}`);
  return cookieHeader(result.value.setCookies);
}

async function sessionOf(headers: Headers, service = dashboard): Promise<AuthSession> {
  const session = await service.getSession(headers);
  if (!session) throw new Error("no session");
  return session;
}

/** A signed-in user who has just confirmed their password (step-up). */
async function steppedUp(email: string, name?: string) {
  await registerVerified(email, name);
  const headers = await signedIn(dashboard, email);
  const confirmed = await dashboard.confirmPassword(await sessionOf(headers), PASSWORD, headers);
  expect(confirmed.ok).toBe(true);
  return { headers, session: await sessionOf(headers) };
}

const changeToken = (to: string) => latestToken(to, "confirm-email-change");

beforeEach(truncateAll);
afterAll(disconnectTestClients);

describe("display name", () => {
  it("is validated on the server, trimmed and saved, then read by the session", async () => {
    await registerVerified("name@example.test", "Old Name");
    const headers = await signedIn(dashboard, "name@example.test");
    const session = await sessionOf(headers);

    for (const bad of ["", "    ", "x".repeat(101), 42, null]) {
      expect(await dashboard.updateName(session, bad, headers)).toMatchObject({
        ok: false,
        code: "INVALID_INPUT",
      });
    }
    expect((await sessionOf(headers)).name).toBe("Old Name");

    expect(await dashboard.updateName(session, "  Asha   Rao  ", headers)).toEqual({
      ok: true,
      value: { name: "Asha Rao" },
    });
    expect((await sessionOf(headers)).name).toBe("Asha Rao");
    expect(
      await migratorDb().auditLog.count({
        where: { action: "auth.profile_updated", actorId: session.userId },
      }),
    ).toBe(1);
    expect((await dashboard.updateName(session, "x".repeat(100), headers)).ok).toBe(true);
  });

  it("is a dashboard-realm action", async () => {
    await registerVerified("realm@example.test");
    const session = await sessionOf(await signedIn(dashboard, "realm@example.test"));
    await expect(platform.updateName(session, "X", noCookies())).rejects.toThrow(/dashboard/);
    await expect(platform.requestEmailChange(session, "a@b.test", noCookies())).rejects.toThrow(
      /dashboard/,
    );
  });
});

describe("email change", () => {
  it("needs a recent password confirmation before it starts", async () => {
    await registerVerified("step@example.test");
    const headers = await signedIn(dashboard, "step@example.test");
    const fresh = await sessionOf(headers);
    expect(await dashboard.requestEmailChange(fresh, "next@example.test", headers)).toMatchObject({
      ok: false,
      code: "REAUTHENTICATION_REQUIRED",
    });
    // A confirmation older than 10 minutes no longer counts.
    await migratorDb().session.updateMany({
      data: { reauthenticatedAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    expect(
      await dashboard.requestEmailChange(await sessionOf(headers), "next@example.test", headers),
    ).toMatchObject({ ok: false, code: "REAUTHENTICATION_REQUIRED" });
    expect(emailsTo("next@example.test")).toHaveLength(0);

    await dashboard.confirmPassword(fresh, PASSWORD, headers);
    expect(
      (await dashboard.requestEmailChange(await sessionOf(headers), "next@example.test", headers))
        .ok,
    ).toBe(true);
  });

  it("changes the email only when the link sent to the new address is used", async () => {
    const { headers, session } = await steppedUp("before@example.test", "Asha");
    const other = await signedIn(dashboard, "before@example.test");

    const requested = await dashboard.requestEmailChange(session, "  After@Example.TEST ", headers);
    expect(requested).toMatchObject({ ok: true, value: { email: "after@example.test" } });
    // Nothing has changed yet: the old address still signs in, the new one doesn't.
    const db = migratorDb();
    expect((await db.user.findUniqueOrThrow({ where: { id: session.userId } })).email).toBe(
      "before@example.test",
    );
    expect(await dashboard.pendingEmailChange(session)).toMatchObject({
      email: "after@example.test",
    });
    expect(
      (await dashboard.signIn({ email: "after@example.test", password: PASSWORD }, noCookies())).ok,
    ).toBe(false);
    expect(emailsTo("before@example.test", "email-changed")).toHaveLength(0);

    const token = changeToken("after@example.test");
    expect(await dashboard.previewEmailChange(token)).toMatchObject({
      email: "after@example.test",
    });
    // Previewing doesn't use the link.
    expect(await dashboard.confirmEmailChange(token, noCookies())).toEqual({
      ok: true,
      value: { email: "after@example.test" },
    });

    const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
    expect(user).toMatchObject({ email: "after@example.test", emailVerified: true });
    expect(await dashboard.pendingEmailChange(session)).toBeNull();
    // The session that asked stays signed in and sees the new address; the
    // other one is signed out, like a password change.
    expect((await sessionOf(headers)).email).toBe("after@example.test");
    expect(await dashboard.getSession(other)).toBeNull();
    // The old address is told, the new one signs in, the old one doesn't.
    const notice = emailsTo("before@example.test", "email-changed");
    expect(notice).toHaveLength(1);
    expect(notice[0]?.text).toContain("a•••@example.test");
    expect(notice[0]?.text).not.toContain("after@example.test");
    await signedIn(dashboard, "after@example.test");
    expect(
      (await dashboard.signIn({ email: "before@example.test", password: PASSWORD }, noCookies()))
        .ok,
    ).toBe(false);

    // Audited without the addresses in plain text.
    const entries = await db.auditLog.findMany({
      where: { actorId: session.userId, action: { startsWith: "auth.email_change" } },
    });
    expect(entries.map((e) => e.action).sort()).toEqual([
      "auth.email_change_requested",
      "auth.email_changed",
    ]);
    const serialised = JSON.stringify(entries.map((e) => e.metadata));
    expect(serialised).not.toContain("before@example.test");
    expect(serialised).not.toContain("after@example.test");
    expect(serialised).toContain("b•••@example.test");
  });

  it("links are single-use, stored hashed, and expire", async () => {
    const { headers, session } = await steppedUp("once@example.test");
    await dashboard.requestEmailChange(session, "once-new@example.test", headers);
    const token = changeToken("once-new@example.test");
    const rows = await migratorDb().verification.findMany();
    expect(rows.some((r) => r.identifier.includes(token) || r.value.includes(token))).toBe(false);

    expect((await dashboard.confirmEmailChange(token, noCookies())).ok).toBe(true);
    expect(await dashboard.confirmEmailChange(token, noCookies())).toMatchObject({
      ok: false,
      code: "INVALID_TOKEN",
    });
    expect(await dashboard.previewEmailChange(token)).toBeNull();

    // An expired link does nothing.
    const again = await sessionOf(headers);
    await dashboard.confirmPassword(again, PASSWORD, headers);
    await dashboard.requestEmailChange(await sessionOf(headers), "later@example.test", headers);
    const late = changeToken("later@example.test");
    await migratorDb().verification.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await dashboard.previewEmailChange(late)).toBeNull();
    expect(await dashboard.confirmEmailChange(late, noCookies())).toMatchObject({
      ok: false,
      code: "INVALID_TOKEN",
    });
    expect(
      (await migratorDb().user.findUniqueOrThrow({ where: { id: session.userId } })).email,
    ).toBe("once-new@example.test");
    expect(await dashboard.confirmEmailChange("forged", noCookies())).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("a new request, or cancelling, retires the earlier link", async () => {
    const { headers, session } = await steppedUp("swap@example.test");
    await dashboard.requestEmailChange(session, "first@example.test", headers);
    const first = changeToken("first@example.test");
    await dashboard.requestEmailChange(session, "second@example.test", headers);
    expect(await dashboard.pendingEmailChange(session)).toMatchObject({
      email: "second@example.test",
    });
    expect((await dashboard.confirmEmailChange(first, noCookies())).ok).toBe(false);

    const second = changeToken("second@example.test");
    expect(await dashboard.cancelEmailChange(session, headers)).toBe(true);
    expect(await dashboard.pendingEmailChange(session)).toBeNull();
    expect((await dashboard.confirmEmailChange(second, noCookies())).ok).toBe(false);
    expect(
      (await migratorDb().user.findUniqueOrThrow({ where: { id: session.userId } })).email,
    ).toBe("swap@example.test");
  });

  it("refuses an address in use without telling the requester", async () => {
    await registerVerified("holder@example.test", "Holder");
    const { headers, session } = await steppedUp("mover@example.test");

    const taken = await dashboard.requestEmailChange(session, "Holder@Example.test", headers);
    const takenPending = await dashboard.pendingEmailChange(session);
    await dashboard.cancelEmailChange(session, headers);
    const free = await dashboard.requestEmailChange(session, "free@example.test", headers);
    // Same answer and the same pending state as for a free address.
    expect(taken.ok && free.ok).toBe(true);
    if (!taken.ok || !free.ok) return;
    expect(Object.keys(taken.value).sort()).toEqual(Object.keys(free.value).sort());
    expect(takenPending).toMatchObject({ email: "holder@example.test" });

    // No link went to the taken address; its owner got a notice instead
    // (as sign-up does), and neither account changed.
    expect(emailsTo("holder@example.test", "confirm-email-change")).toHaveLength(0);
    expect(emailsTo("holder@example.test", "email-change-address-in-use")).toHaveLength(1);
    const db = migratorDb();
    expect(await db.user.count({ where: { email: "holder@example.test" } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: session.userId } })).email).toBe(
      "mover@example.test",
    );

    // Its own address (any case) is refused plainly.
    expect(
      await dashboard.requestEmailChange(session, "MOVER@example.test", headers),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await dashboard.requestEmailChange(session, "not-an-email", headers)).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  });

  it("an address registered after the request can't be taken over", async () => {
    const { headers, session } = await steppedUp("racer@example.test");
    await dashboard.requestEmailChange(session, "contested@example.test", headers);
    const token = changeToken("contested@example.test");
    await registerVerified("contested@example.test", "Contested");
    expect(await dashboard.confirmEmailChange(token, noCookies())).toMatchObject({
      ok: false,
      code: "INVALID_TOKEN",
    });
    const db = migratorDb();
    expect((await db.user.findUniqueOrThrow({ where: { id: session.userId } })).email).toBe(
      "racer@example.test",
    );
    expect(await db.user.count({ where: { email: "contested@example.test" } })).toBe(1);
  });

  it("password-reset links sent to the old address stop working", async () => {
    const { headers, session } = await steppedUp("reset-old@example.test");
    await dashboard.requestPasswordReset("reset-old@example.test", noCookies());
    const reset = latestToken("reset-old@example.test", "reset-password");
    await dashboard.requestEmailChange(session, "reset-new@example.test", headers);
    expect(
      (await dashboard.confirmEmailChange(changeToken("reset-new@example.test"), noCookies())).ok,
    ).toBe(true);
    expect(await dashboard.resetPassword(reset, "a brand new password", noCookies())).toMatchObject(
      { ok: false, code: "INVALID_TOKEN" },
    );
  });

  it("is rate limited per account", async () => {
    const { headers, session } = await steppedUp("limit@example.test");
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(
        await dashboard.requestEmailChange(session, `limit-${String(i)}@example.test`, headers),
      );
    }
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3]).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(emailsTo("limit-3@example.test")).toHaveLength(0);
  });

  it("is refused for platform staff and never touches platform sessions", async () => {
    const { headers, session } = await steppedUp("ops@example.test");
    const db = migratorDb();
    await db.platformStaff.create({ data: { userId: session.userId, role: "SUPPORT" } });
    const adminHeaders = await signedIn(platform, "ops@example.test");
    expect(
      await dashboard.requestEmailChange(session, "ops-new@example.test", headers),
    ).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    expect(emailsTo("ops-new@example.test")).toHaveLength(0);
    expect(await platform.getSession(adminHeaders)).toMatchObject({
      realm: "PLATFORM",
      email: "ops@example.test",
    });
  });

  it("a request made before becoming staff can't complete afterwards", async () => {
    const { headers, session } = await steppedUp("later-staff@example.test");
    await dashboard.requestEmailChange(session, "later-staff-new@example.test", headers);
    const token = changeToken("later-staff-new@example.test");
    await migratorDb().platformStaff.create({ data: { userId: session.userId, role: "SUPPORT" } });
    const adminHeaders = await signedIn(platform, "later-staff@example.test");
    expect((await dashboard.confirmEmailChange(token, noCookies())).ok).toBe(false);
    expect(await platform.getSession(adminHeaders)).not.toBeNull();
  });
});
