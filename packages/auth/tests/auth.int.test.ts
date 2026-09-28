import { migratorDb, disconnectTestClients, truncateAll } from "@storevia/database/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cookieHeader, emailsTo, latestToken, noCookies } from "./helpers";
import { AuthService, hasRecentAuth } from "../src";
import { totpAt, totpStep } from "../src/totp";

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

async function signedIn(
  service: AuthService,
  email: string,
  password = PASSWORD,
): Promise<Headers> {
  const result = await service.signIn({ email, password }, noCookies());
  if (!result.ok) throw new Error(`sign-in failed: ${result.code}`);
  return cookieHeader(result.value.setCookies);
}

beforeEach(truncateAll);
afterAll(disconnectTestClients);

describe("sign-up and email verification", () => {
  it("requires a verified email before sign-in", async () => {
    await dashboard.signUp(
      { name: "Ada", email: "ada@example.test", password: PASSWORD },
      noCookies(),
    );
    expect(emailsTo("ada@example.test", "verify-email")).toHaveLength(1);
    const early = await dashboard.signIn(
      { email: "ada@example.test", password: PASSWORD },
      noCookies(),
    );
    expect(early).toMatchObject({ ok: false, code: "EMAIL_NOT_VERIFIED" });

    const verified = await dashboard.verifyEmail(
      latestToken("ada@example.test", "verify-email"),
      noCookies(),
    );
    expect(verified.ok).toBe(true);
    const session = await dashboard.getSession(await signedIn(dashboard, "ada@example.test"));
    expect(session).toMatchObject({
      email: "ada@example.test",
      realm: "DASHBOARD",
      emailVerified: true,
    });
  });

  it("stores the password as Argon2id and never in plain text", async () => {
    await registerVerified("hash@example.test");
    const account = await migratorDb().account.findFirstOrThrow({
      where: { providerId: "credential" },
    });
    expect(account.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(account.passwordHash).not.toContain(PASSWORD);
  });

  it("does not reveal whether an email is registered", async () => {
    await registerVerified("taken@example.test");
    const again = await dashboard.signUp(
      { name: "Mallory", email: "taken@example.test", password: "another password 1" },
      noCookies(),
    );
    expect(again).toEqual({ ok: true, value: { email: "taken@example.test" } });
    expect(emailsTo("taken@example.test", "existing-account")).toHaveLength(1);
    expect(await migratorDb().user.count({ where: { email: "taken@example.test" } })).toBe(1);
  });

  it("rejects invalid verification tokens", async () => {
    expect(await dashboard.verifyEmail("forged.token.value", noCookies())).toMatchObject({
      ok: false,
      code: "INVALID_TOKEN",
    });
  });

  it("enforces the password policy", async () => {
    const result = await dashboard.signUp(
      { name: "Short", email: "short@example.test", password: "short" },
      noCookies(),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("stores verification identifiers hashed", async () => {
    await dashboard.signUp(
      { name: "R", email: "reset-hash@example.test", password: PASSWORD },
      noCookies(),
    );
    await dashboard.verifyEmail(
      latestToken("reset-hash@example.test", "verify-email"),
      noCookies(),
    );
    await dashboard.requestPasswordReset("reset-hash@example.test", noCookies());
    const token = latestToken("reset-hash@example.test", "reset-password");
    const rows = await migratorDb().verification.findMany();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.identifier.includes(token))).toBe(false);
  });
});

describe("sign-in", () => {
  it("gives the same answer for a wrong password and an unknown email", async () => {
    await registerVerified("bob@example.test");
    const wrong = await dashboard.signIn(
      { email: "bob@example.test", password: "wrong password!" },
      noCookies(),
    );
    const unknown = await dashboard.signIn(
      { email: "nobody@example.test", password: "wrong password!" },
      noCookies(),
    );
    expect(wrong).toEqual(unknown);
    expect(wrong).toMatchObject({ ok: false, code: "INVALID_CREDENTIALS" });
  });

  it("rate-limits repeated attempts for one account", async () => {
    await registerVerified("brute@example.test");
    const attempts = [];
    for (let i = 0; i < 11; i++) {
      attempts.push(
        await dashboard.signIn(
          { email: "brute@example.test", password: `guess ${String(i)}xxxx` },
          noCookies(),
        ),
      );
    }
    expect(attempts.at(-1)).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    // Even the right password is refused while limited.
    expect(
      await dashboard.signIn({ email: "brute@example.test", password: PASSWORD }, noCookies()),
    ).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rate-limits sign-ups per client IP when the edge IP header is trusted", async () => {
    process.env["TRUSTED_CLIENT_IP_HEADER"] = "x-test-client-ip";
    try {
      const headers = () =>
        new Headers({ "x-test-client-ip": "203.0.113.7", "user-agent": "vitest" });
      const results = [];
      for (let i = 0; i < 11; i++) {
        results.push(
          await dashboard.signUp(
            { name: "Burst", email: `burst${String(i)}@example.test`, password: PASSWORD },
            headers(),
          ),
        );
      }
      expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
      expect(results[10]).toMatchObject({ ok: false, code: "RATE_LIMITED" });
      // Another client is unaffected.
      const other = await dashboard.signUp(
        { name: "Other", email: "other-ip@example.test", password: PASSWORD },
        new Headers({ "x-test-client-ip": "198.51.100.9" }),
      );
      expect(other.ok).toBe(true);
    } finally {
      delete process.env["TRUSTED_CLIENT_IP_HEADER"];
    }
  });

  it("issues host-only, HttpOnly session cookies", async () => {
    await registerVerified("cookie@example.test");
    const result = await dashboard.signIn(
      { email: "cookie@example.test", password: PASSWORD },
      noCookies(),
    );
    if (!result.ok) throw new Error("sign-in failed");
    const cookie = result.value.setCookies.find((c) => c.startsWith("storevia.session_token="));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("creates a new session on every sign-in (no fixation)", async () => {
    await registerVerified("fix@example.test");
    const first = await signedIn(dashboard, "fix@example.test");
    const second = await signedIn(dashboard, "fix@example.test");
    const a = await dashboard.getSession(first);
    const b = await dashboard.getSession(second);
    expect(a?.sessionId).toBeDefined();
    expect(a?.sessionId).not.toBe(b?.sessionId);
  });
});

describe("sessions", () => {
  it("rejects missing, tampered and unsigned cookies", async () => {
    await registerVerified("tamper@example.test");
    const headers = await signedIn(dashboard, "tamper@example.test");
    expect(await dashboard.getSession(noCookies())).toBeNull();
    const cookie = headers.get("cookie") ?? "";
    const tampered = cookie.replace(
      /session_token=([^.;]+)\.([^;]+)/,
      (_m, token: string) => `session_token=${token}.AAAA`,
    );
    expect(await dashboard.getSession(new Headers({ cookie: tampered }))).toBeNull();
    const row = await migratorDb().session.findFirstOrThrow();
    expect(
      await dashboard.getSession(new Headers({ cookie: `storevia.session_token=${row.token}` })),
    ).toBeNull();
  });

  it("ends the session on sign-out", async () => {
    await registerVerified("out@example.test");
    const headers = await signedIn(dashboard, "out@example.test");
    await dashboard.signOut(headers);
    expect(await dashboard.getSession(headers)).toBeNull();
  });

  it("rejects expired sessions", async () => {
    await registerVerified("expired@example.test");
    const headers = await signedIn(dashboard, "expired@example.test");
    await migratorDb().session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await dashboard.getSession(headers)).toBeNull();
  });

  it("enforces the absolute session lifetime", async () => {
    await registerVerified("old@example.test");
    const headers = await signedIn(dashboard, "old@example.test");
    await migratorDb().session.updateMany({
      data: { createdAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) },
    });
    expect(await dashboard.getSession(headers)).toBeNull();
    expect(await migratorDb().session.count()).toBe(0);
  });

  it("revokes one session or all other sessions, only for the owner", async () => {
    await registerVerified("multi@example.test");
    await registerVerified("other@example.test");
    const one = await signedIn(dashboard, "multi@example.test");
    const two = await signedIn(dashboard, "multi@example.test");
    const otherUser = await signedIn(dashboard, "other@example.test");
    const s1 = await dashboard.getSession(one);
    const s2 = await dashboard.getSession(two);
    const so = await dashboard.getSession(otherUser);
    if (!s1 || !s2 || !so) throw new Error("sessions missing");

    // Another user cannot revoke s1 by ID.
    expect(await dashboard.revokeSession(so, s1.sessionId, otherUser)).toBe(false);
    expect(await dashboard.getSession(one)).not.toBeNull();

    expect((await dashboard.listSessions(s1)).map((s) => s.id).sort()).toEqual(
      [s1.sessionId, s2.sessionId].sort(),
    );
    expect(await dashboard.revokeSession(s1, s2.sessionId, one)).toBe(true);
    expect(await dashboard.getSession(two)).toBeNull();
    expect(await dashboard.getSession(one)).not.toBeNull();
  });

  it("invalidates sessions of disabled users", async () => {
    await registerVerified("disabled@example.test");
    const headers = await signedIn(dashboard, "disabled@example.test");
    await migratorDb().user.updateMany({ data: { status: "DISABLED" } });
    expect(await dashboard.getSession(headers)).toBeNull();
    expect(
      await dashboard.signIn({ email: "disabled@example.test", password: PASSWORD }, noCookies()),
    ).toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("invalidates sessions of soft-deleted users", async () => {
    await registerVerified("deleted@example.test");
    const headers = await signedIn(dashboard, "deleted@example.test");
    await migratorDb().user.updateMany({ data: { deletedAt: new Date() } });
    expect(await dashboard.getSession(headers)).toBeNull();
  });

  it("step-up re-authentication stamps the session", async () => {
    await registerVerified("step@example.test");
    const headers = await signedIn(dashboard, "step@example.test");
    const session = await dashboard.getSession(headers);
    if (!session) throw new Error("no session");
    expect(hasRecentAuth(session)).toBe(false);
    expect(await dashboard.confirmPassword(session, "wrong password", headers)).toMatchObject({
      ok: false,
    });
    expect(await dashboard.confirmPassword(session, PASSWORD, headers)).toEqual({
      ok: true,
      value: undefined,
    });
    const refreshed = await dashboard.getSession(headers);
    expect(refreshed && hasRecentAuth(refreshed)).toBe(true);
  });
});

describe("password reset and change", () => {
  it("resets with a single-use token and revokes existing sessions", async () => {
    await registerVerified("reset@example.test");
    const oldSession = await signedIn(dashboard, "reset@example.test");
    const unknown = await dashboard.requestPasswordReset("nobody@example.test", noCookies());
    expect(unknown).toEqual({ ok: true, value: undefined });
    await dashboard.requestPasswordReset("reset@example.test", noCookies());
    const token = latestToken("reset@example.test", "reset-password");

    expect(await dashboard.resetPassword(token, "a brand new password", noCookies())).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await dashboard.getSession(oldSession)).toBeNull();
    expect(await dashboard.resetPassword(token, "yet another password", noCookies())).toMatchObject(
      { ok: false, code: "INVALID_TOKEN" },
    );
    expect(emailsTo("reset@example.test", "password-changed")).toHaveLength(1);
    await signedIn(dashboard, "reset@example.test", "a brand new password");
  });

  it("changes the password and signs out other sessions", async () => {
    await registerVerified("change@example.test");
    const current = await signedIn(dashboard, "change@example.test");
    const other = await signedIn(dashboard, "change@example.test");
    const session = await dashboard.getSession(current);
    if (!session) throw new Error("no session");
    expect(
      await dashboard.changePassword(
        session,
        { currentPassword: "wrong", newPassword: "new password 123" },
        current,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await dashboard.changePassword(
        session,
        { currentPassword: PASSWORD, newPassword: "new password 123" },
        current,
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(await dashboard.getSession(other)).toBeNull();
  });
});

describe("realm isolation (T11)", () => {
  it("platform sign-in requires active platform staff", async () => {
    await registerVerified("merchant@example.test");
    expect(
      await platform.signIn({ email: "merchant@example.test", password: PASSWORD }, noCookies()),
    ).toMatchObject({ ok: false, code: "INVALID_CREDENTIALS" });

    const user = await migratorDb().user.findFirstOrThrow({
      where: { email: "merchant@example.test" },
    });
    await migratorDb().platformStaff.create({ data: { userId: user.id, role: "SUPPORT" } });
    const adminHeaders = await signedIn(platform, "merchant@example.test");
    expect(await platform.getSession(adminHeaders)).toMatchObject({ realm: "PLATFORM" });

    await migratorDb().platformStaff.update({
      where: { userId: user.id },
      data: { active: false },
    });
    expect(await platform.getSession(adminHeaders)).toBeNull();
  });

  it("failed dashboard sign-ins never lock a staff member out of platform-admin (M8)", async () => {
    await registerVerified("ops@example.test");
    const user = await migratorDb().user.findFirstOrThrow({ where: { email: "ops@example.test" } });
    await migratorDb().platformStaff.create({ data: { userId: user.id, role: "SUPPORT" } });
    for (let i = 0; i < 12; i++) {
      await dashboard.signIn(
        { email: "ops@example.test", password: `guess ${String(i)}xxxx` },
        noCookies(),
      );
    }
    expect(
      await dashboard.signIn({ email: "ops@example.test", password: PASSWORD }, noCookies()),
    ).toMatchObject({ code: "RATE_LIMITED" });
    expect(
      await platform.signIn({ email: "ops@example.test", password: PASSWORD }, noCookies()),
    ).toMatchObject({ ok: true });
  });

  it("one attacking address can't lock an account out for everyone (M8)", async () => {
    process.env["TRUSTED_CLIENT_IP_HEADER"] = "x-test-client-ip";
    try {
      await registerVerified("target@example.test");
      const from = (ip: string) => new Headers({ "x-test-client-ip": ip, "user-agent": "vitest" });
      for (let i = 0; i < 12; i++) {
        await dashboard.signIn(
          { email: "target@example.test", password: `guess ${String(i)}xxxx` },
          from("203.0.113.66"),
        );
      }
      expect(
        await dashboard.signIn(
          { email: "target@example.test", password: PASSWORD },
          from("203.0.113.66"),
        ),
      ).toMatchObject({ code: "RATE_LIMITED" });
      // The account holder, elsewhere, still signs in.
      expect(
        await dashboard.signIn(
          { email: "target@example.test", password: PASSWORD },
          from("198.51.100.20"),
        ),
      ).toMatchObject({ ok: true });
    } finally {
      delete process.env["TRUSTED_CLIENT_IP_HEADER"];
    }
  });

  it("sessions are not valid across realms", async () => {
    await registerVerified("staff@example.test");
    const user = await migratorDb().user.findFirstOrThrow({
      where: { email: "staff@example.test" },
    });
    await migratorDb().platformStaff.create({ data: { userId: user.id, role: "SUPER_ADMIN" } });
    const dashboardHeaders = await signedIn(dashboard, "staff@example.test");
    const adminHeaders = await signedIn(platform, "staff@example.test");

    expect(await platform.getSession(dashboardHeaders)).toBeNull();
    expect(await dashboard.getSession(adminHeaders)).toBeNull();

    // Same cookie value presented under the other realm's cookie name.
    const dashCookie = (dashboardHeaders.get("cookie") ?? "").replace(
      "storevia.session_token",
      "storevia-admin.session_token",
    );
    expect(await platform.getSession(new Headers({ cookie: dashCookie }))).toBeNull();
    const adminCookie = (adminHeaders.get("cookie") ?? "").replace(
      "storevia-admin.session_token",
      "storevia.session_token",
    );
    expect(await dashboard.getSession(new Headers({ cookie: adminCookie }))).toBeNull();
  });

  it("platform realm has no self sign-up", async () => {
    expect(
      await platform.signUp(
        { name: "X", email: "x@example.test", password: PASSWORD },
        noCookies(),
      ),
    ).toMatchObject({ ok: false });
  });
});

describe("platform staff MFA (M8, S12)", () => {
  async function staff(email: string): Promise<Headers> {
    await registerVerified(email);
    const user = await migratorDb().user.findFirstOrThrow({ where: { email } });
    await migratorDb().platformStaff.create({ data: { userId: user.id, role: "SUPPORT" } });
    return signedIn(platform, email);
  }
  const sessionOf = async (headers: Headers) => {
    const s = await platform.getSession(headers);
    if (!s) throw new Error("no session");
    return s;
  };

  it("a new staff session is unverified until an authenticator is enrolled", async () => {
    const headers = await staff("mfa-new@example.test");
    const session = await sessionOf(headers);
    expect(session.mfaVerifiedAt).toBeNull();
    expect(await platform.mfaStatus(session)).toEqual({ enrolled: false, recoveryCodesLeft: 0 });

    const started = await platform.startMfaEnrolment(session);
    if (!started.ok) throw new Error("enrolment refused");
    const { secret, uri } = started.value;
    expect(uri).toContain(`secret=${secret}`);
    // The secret is sealed at rest.
    const row = await migratorDb().staffMfa.findUniqueOrThrow({
      where: { userId: session.userId },
    });
    expect(Buffer.from(row.secretCiphertext).toString("utf8")).not.toContain(secret);

    expect(await platform.completeMfaEnrolment(session, "000000", noCookies())).toMatchObject({
      ok: false,
      code: "INVALID_TOKEN",
    });
    const done = await platform.completeMfaEnrolment(
      session,
      totpAt(secret, totpStep()),
      noCookies(),
    );
    if (!done.ok) throw new Error("enrolment failed");
    expect(done.value.recoveryCodes).toHaveLength(10);
    expect((await sessionOf(headers)).mfaVerifiedAt).not.toBeNull();
    // Enrolled: a second enrolment is refused (a stolen session can't swap the device).
    expect((await platform.startMfaEnrolment(session)).ok).toBe(false);
  });

  it("each sign-in needs a fresh code; a used code or recovery code never works twice", async () => {
    const first = await staff("mfa-again@example.test");
    const s1 = await sessionOf(first);
    const started = await platform.startMfaEnrolment(s1);
    if (!started.ok) throw new Error("enrolment refused");
    const secret = started.value.secret;
    const now = totpStep();
    const done = await platform.completeMfaEnrolment(s1, totpAt(secret, now), noCookies());
    if (!done.ok) throw new Error("enrolment failed");

    const second = await signedIn(platform, "mfa-again@example.test");
    const s2 = await sessionOf(second);
    expect(s2.mfaVerifiedAt).toBeNull();
    // The code just used at enrolment is spent.
    expect(await platform.verifyMfa(s2, totpAt(secret, now), noCookies())).toMatchObject({
      ok: false,
    });
    // The next step's code works once.
    expect(await platform.verifyMfa(s2, totpAt(secret, now + 1), noCookies())).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await sessionOf(second)).mfaVerifiedAt).not.toBeNull();

    const third = await sessionOf(await signedIn(platform, "mfa-again@example.test"));
    expect(await platform.verifyMfa(third, totpAt(secret, now + 1), noCookies())).toMatchObject({
      ok: false,
    });
    const recovery = done.value.recoveryCodes[0] ?? "";
    expect((await platform.verifyMfa(third, recovery.toUpperCase(), noCookies())).ok).toBe(true);
    const fourth = await sessionOf(await signedIn(platform, "mfa-again@example.test"));
    expect((await platform.verifyMfa(fourth, recovery, noCookies())).ok).toBe(false);
    expect((await platform.mfaStatus(fourth)).recoveryCodesLeft).toBe(9);
  });

  it("guessing codes is rate limited, and the dashboard realm has no staff MFA", async () => {
    const headers = await staff("mfa-guess@example.test");
    const session = await sessionOf(headers);
    const started = await platform.startMfaEnrolment(session);
    if (!started.ok) throw new Error("enrolment refused");
    await platform.completeMfaEnrolment(
      session,
      totpAt(started.value.secret, totpStep()),
      noCookies(),
    );
    const again = await sessionOf(await signedIn(platform, "mfa-guess@example.test"));
    const results = [];
    for (let i = 0; i < 12; i++) {
      results.push(await platform.verifyMfa(again, String(100000 + i), noCookies()));
    }
    expect(results.at(-1)).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    await expect(dashboard.mfaStatus(session)).rejects.toThrow(/platform realm/);
  });
});
