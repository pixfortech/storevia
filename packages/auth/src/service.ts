import "server-only";
import { systemDb } from "@storevia/database/system";
import {
  existingAccountMessage,
  getEmailSender,
  passwordChangedMessage,
  resetPasswordMessage,
  verifyEmailMessage,
  type EmailMessage,
} from "@storevia/email";
import {
  clientIp,
  consumeRateLimits,
  userAgent,
  type RateLimitRule,
} from "@storevia/security/server";
import { uuidv7 } from "@storevia/types";
import { emailSchema, passwordSchema, personNameSchema } from "@storevia/validation";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { hashPassword, isBreachedPassword, verifyPassword } from "./password";
import {
  authFail,
  authOk,
  type AuthErrorCode,
  type AuthResult,
  type AuthSession,
  type Realm,
} from "./types";

export interface AuthServiceOptions {
  readonly realm: Realm;
  /** Public origin of the app that owns this realm, e.g. https://app.storevia.com */
  readonly baseURL: string;
  /** Per-realm secret used to sign session cookies (ADR-0021). */
  readonly secret: string;
  /** e.g. nextCookies() in a Next.js app; omitted in tests. */
  readonly plugins?: BetterAuthPlugin[];
}

interface RealmPolicy {
  readonly cookiePrefix: string;
  readonly idleSeconds: number;
  readonly absoluteSeconds: number;
  readonly refreshSeconds: number;
  readonly sameSite: "lax" | "strict";
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

// docs/architecture/04-auth-rbac.md §4
const POLICIES: Record<Realm, RealmPolicy> = {
  DASHBOARD: {
    cookiePrefix: "storevia",
    idleSeconds: 7 * DAY,
    absoluteSeconds: 30 * DAY,
    refreshSeconds: HOUR,
    sameSite: "lax",
  },
  PLATFORM: {
    cookiePrefix: "storevia-admin",
    idleSeconds: 30 * 60,
    absoluteSeconds: 12 * HOUR,
    refreshSeconds: 5 * 60,
    sameSite: "strict",
  },
};

const RATE_LIMITS = {
  signInIp: { name: "auth:sign-in:ip", limit: 30, windowSeconds: 5 * 60 },
  signInEmail: { name: "auth:sign-in:email", limit: 10, windowSeconds: 15 * 60 },
  signUpIp: { name: "auth:sign-up:ip", limit: 10, windowSeconds: HOUR },
  resetRequestEmail: { name: "auth:reset-request:email", limit: 3, windowSeconds: HOUR },
  resetRequestIp: { name: "auth:reset-request:ip", limit: 10, windowSeconds: HOUR },
  resetSubmitIp: { name: "auth:reset-submit:ip", limit: 20, windowSeconds: HOUR },
  verifyResendEmail: { name: "auth:verify-resend:email", limit: 3, windowSeconds: HOUR },
  verifySubmitIp: { name: "auth:verify-submit:ip", limit: 30, windowSeconds: HOUR },
  confirmPasswordUser: { name: "auth:confirm-password:user", limit: 10, windowSeconds: 15 * 60 },
  changePasswordUser: { name: "auth:change-password:user", limit: 10, windowSeconds: HOUR },
} satisfies Record<string, RateLimitRule>;

const signUpSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
const signInSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

const GENERIC_SIGN_IN_ERROR = "Email or password is incorrect.";

async function send(message: EmailMessage): Promise<void> {
  await getEmailSender().send(message);
}

async function audit(
  action: string,
  actorId: string | null,
  headers: Headers | null,
  metadata?: Record<string, string>,
): Promise<void> {
  await systemDb().auditLog.createMany({
    data: [
      {
        actorType: "USER",
        actorId,
        action,
        entityType: "User",
        entityId: actorId,
        ...(metadata ? { metadata } : {}),
        ipAddress: headers ? clientIp(headers) : null,
        userAgent: headers ? userAgent(headers) : null,
      },
    ],
  });
}

/** May this user hold a session in this realm right now? */
async function sessionAllowed(realm: Realm, userId: string): Promise<boolean> {
  const user = await systemDb().user.findUnique({
    where: { id: userId },
    select: { status: true, deletedAt: true, platformStaff: { select: { active: true } } },
  });
  if (user?.status !== "ACTIVE" || user.deletedAt) return false;
  if (realm === "PLATFORM") return user.platformStaff?.active === true;
  return true;
}

function apiErrorCode(error: unknown): string | undefined {
  if (error instanceof APIError) {
    const body = error.body as { code?: unknown } | undefined;
    return typeof body?.code === "string" ? body.code : undefined;
  }
  return undefined;
}

function buildBetterAuth(options: AuthServiceOptions) {
  const policy = POLICIES[options.realm];
  const baseURL = options.baseURL.replace(/\/$/, "");
  const secure = baseURL.startsWith("https://");
  // Host-only __Host- cookies in production (Secure, Path=/, no Domain).
  const cookieName = (name: string) =>
    secure ? `__Host-${policy.cookiePrefix}.${name}` : `${policy.cookiePrefix}.${name}`;

  return betterAuth({
    appName: "Storevia",
    baseURL,
    // Better Auth's HTTP handler is deliberately NOT mounted: every auth flow
    // goes through this service (validation, rate limits, audit).
    basePath: "/api/auth",
    secret: options.secret,
    database: prismaAdapter(systemDb(), { provider: "postgresql" }),
    telemetry: { enabled: false },
    rateLimit: { enabled: false },
    advanced: {
      database: { generateId: () => uuidv7() },
      useSecureCookies: false,
      defaultCookieAttributes: {
        secure,
        httpOnly: true,
        sameSite: policy.sameSite,
        path: "/",
      },
      cookies: {
        session_token: { name: cookieName("session_token") },
        session_data: { name: cookieName("session_data") },
        dont_remember: { name: cookieName("dont_remember") },
      },
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false, input: false, defaultValue: "en" },
        timezone: { type: "string", required: false, input: false, defaultValue: "UTC" },
        status: { type: "string", required: false, input: false, defaultValue: "ACTIVE" },
      },
    },
    session: {
      expiresIn: policy.idleSeconds,
      updateAge: policy.refreshSeconds,
      cookieCache: { enabled: false },
      additionalFields: {
        realm: { type: "string", required: false, input: false, defaultValue: options.realm },
        reauthenticatedAt: { type: "date", required: false, input: false },
      },
    },
    account: {
      fields: {
        password: "passwordHash",
        accessToken: "accessTokenEnc",
        refreshToken: "refreshTokenEnc",
        idToken: "idTokenEnc",
      },
      encryptOAuthTokens: true,
    },
    verification: { storeIdentifier: "hashed" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: options.realm === "PLATFORM",
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
      sendResetPassword: async ({ user, token }) => {
        await send(
          resetPasswordMessage(
            user.email,
            user.name,
            `${baseURL}/reset-password?token=${encodeURIComponent(token)}`,
          ),
        );
      },
      onExistingUserSignUp: async ({ user }) => {
        await send(existingAccountMessage(user.email, user.name, `${baseURL}/sign-in`));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, token }) => {
        await send(
          verifyEmailMessage(
            user.email,
            user.name,
            `${baseURL}/verify-email?token=${encodeURIComponent(token)}`,
          ),
        );
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (!(await sessionAllowed(options.realm, session.userId))) return false;
            return { data: { ...session, realm: options.realm } };
          },
        },
      },
    },
    plugins: options.plugins ?? [],
  });
}

export type BetterAuthInstance = ReturnType<typeof buildBetterAuth>;

export interface SignInResult {
  /** Set-Cookie values (for callers without the nextCookies plugin, e.g. tests). */
  readonly setCookies: readonly string[];
}

export interface SessionSummary {
  readonly id: string;
  readonly current: boolean;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
}

/**
 * Storevia's authentication API for one realm. Apps call these functions from
 * server actions; nothing else in the codebase talks to Better Auth.
 */
export class AuthService {
  readonly realm: Realm;
  private readonly auth: BetterAuthInstance;
  private readonly policy: RealmPolicy;
  private readonly baseURL: string;

  constructor(options: AuthServiceOptions) {
    this.realm = options.realm;
    this.policy = POLICIES[options.realm];
    this.baseURL = options.baseURL.replace(/\/$/, "");
    this.auth = buildBetterAuth(options);
  }

  private async limited(
    checks: readonly (readonly [RateLimitRule, string])[],
  ): Promise<AuthResult<never> | null> {
    const result = await consumeRateLimits(checks);
    if (result.allowed) return null;
    return authFail(
      "RATE_LIMITED",
      "Too many attempts. Please wait a moment and try again.",
      result.retryAfterSeconds,
    );
  }

  async signUp(input: unknown, headers: Headers): Promise<AuthResult<{ email: string }>> {
    if (this.realm !== "DASHBOARD")
      return authFail("INVALID_INPUT", "Sign-up is not available here.");
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success)
      return authFail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
    const blocked = await this.limited([[RATE_LIMITS.signUpIp, clientIp(headers)]]);
    if (blocked) return blocked;
    if (await isBreachedPassword(parsed.data.password)) {
      return authFail(
        "WEAK_PASSWORD",
        "This password has appeared in a data breach. Please choose a different one.",
      );
    }
    try {
      // Existing emails get a generic success here and an "account exists"
      // email (ADR-0021), so the response never reveals registration.
      await this.auth.api.signUpEmail({ body: parsed.data, headers });
    } catch (error) {
      return this.mapError(error, "INVALID_INPUT", "We couldn't create your account.");
    }
    return authOk({ email: parsed.data.email });
  }

  async signIn(input: unknown, headers: Headers): Promise<AuthResult<SignInResult>> {
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) return authFail("INVALID_CREDENTIALS", GENERIC_SIGN_IN_ERROR);
    const blocked = await this.limited([
      [RATE_LIMITS.signInIp, clientIp(headers)],
      [RATE_LIMITS.signInEmail, parsed.data.email],
    ]);
    if (blocked) return blocked;
    try {
      const result = await this.auth.api.signInEmail({
        body: { email: parsed.data.email, password: parsed.data.password, rememberMe: true },
        headers,
        returnHeaders: true,
      });
      const userId = result.response.user.id;
      await audit(`auth.${this.realm.toLowerCase()}.sign_in`, userId, headers);
      return authOk({ setCookies: result.headers.getSetCookie() });
    } catch (error) {
      if (apiErrorCode(error) === "EMAIL_NOT_VERIFIED") {
        return authFail(
          "EMAIL_NOT_VERIFIED",
          "Please confirm your email address. We've sent you a new link.",
        );
      }
      // Wrong password, unknown email, disabled user and (platform realm)
      // non-staff users all get the same answer.
      return authFail("INVALID_CREDENTIALS", GENERIC_SIGN_IN_ERROR);
    }
  }

  async signOut(headers: Headers): Promise<void> {
    const session = await this.getSession(headers);
    try {
      await this.auth.api.signOut({ headers });
    } catch {
      // Already signed out.
    }
    if (session) await audit(`auth.${this.realm.toLowerCase()}.sign_out`, session.userId, headers);
  }

  async verifyEmail(token: string, headers: Headers): Promise<AuthResult> {
    const blocked = await this.limited([[RATE_LIMITS.verifySubmitIp, clientIp(headers)]]);
    if (blocked) return blocked;
    if (!token || token.length > 4096)
      return authFail("INVALID_TOKEN", "This link is invalid or has expired.");
    try {
      await this.auth.api.verifyEmail({ query: { token }, headers });
    } catch {
      return authFail("INVALID_TOKEN", "This link is invalid or has expired.");
    }
    return authOk(undefined);
  }

  async resendVerification(email: unknown, headers: Headers): Promise<AuthResult> {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return authOk(undefined);
    const blocked = await this.limited([[RATE_LIMITS.verifyResendEmail, parsed.data]]);
    if (blocked) return blocked;
    try {
      await this.auth.api.sendVerificationEmail({ body: { email: parsed.data }, headers });
    } catch {
      // Uniform response whether or not the account exists.
    }
    return authOk(undefined);
  }

  async requestPasswordReset(email: unknown, headers: Headers): Promise<AuthResult> {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return authFail("INVALID_INPUT", "Enter a valid email address.");
    const blocked = await this.limited([
      [RATE_LIMITS.resetRequestIp, clientIp(headers)],
      [RATE_LIMITS.resetRequestEmail, parsed.data],
    ]);
    if (blocked) return blocked;
    try {
      await this.auth.api.requestPasswordReset({
        body: { email: parsed.data, redirectTo: `${this.baseURL}/reset-password` },
        headers,
      });
    } catch {
      // Uniform response whether or not the account exists.
    }
    return authOk(undefined);
  }

  async resetPassword(token: string, newPassword: unknown, headers: Headers): Promise<AuthResult> {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success)
      return authFail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid password.");
    const blocked = await this.limited([[RATE_LIMITS.resetSubmitIp, clientIp(headers)]]);
    if (blocked) return blocked;
    if (await isBreachedPassword(parsed.data)) {
      return authFail(
        "WEAK_PASSWORD",
        "This password has appeared in a data breach. Please choose a different one.",
      );
    }
    const verification = await this.findResetTarget(token);
    try {
      await this.auth.api.resetPassword({ body: { token, newPassword: parsed.data }, headers });
    } catch {
      return authFail("INVALID_TOKEN", "This link is invalid or has expired.");
    }
    if (verification) {
      await audit("auth.password_reset", verification.id, headers);
      await send(passwordChangedMessage(verification.email, verification.name));
    }
    return authOk(undefined);
  }

  private async findResetTarget(token: string) {
    // Look up the user only to notify and audit after a successful reset.
    const { createHash } = await import("node:crypto");
    const identifier = createHash("sha256").update(`reset-password:${token}`).digest("base64url");
    const row = await systemDb().verification.findFirst({
      where: { OR: [{ identifier }, { identifier: `reset-password:${token}` }] },
      select: { value: true },
    });
    if (!row) return null;
    return systemDb().user.findUnique({
      where: { id: row.value },
      select: { id: true, email: true, name: true },
    });
  }

  async changePassword(
    session: AuthSession,
    input: { currentPassword: unknown; newPassword: unknown },
    headers: Headers,
  ): Promise<AuthResult> {
    const blocked = await this.limited([[RATE_LIMITS.changePasswordUser, session.userId]]);
    if (blocked) return blocked;
    const current = z.string().min(1).max(128).safeParse(input.currentPassword);
    const next = passwordSchema.safeParse(input.newPassword);
    if (!current.success)
      return authFail("INVALID_CREDENTIALS", "Your current password is incorrect.");
    if (!next.success)
      return authFail("INVALID_INPUT", next.error.issues[0]?.message ?? "Invalid password.");
    if (await isBreachedPassword(next.data)) {
      return authFail(
        "WEAK_PASSWORD",
        "This password has appeared in a data breach. Please choose a different one.",
      );
    }
    try {
      await this.auth.api.changePassword({
        body: { currentPassword: current.data, newPassword: next.data, revokeOtherSessions: true },
        headers,
      });
    } catch {
      return authFail("INVALID_CREDENTIALS", "Your current password is incorrect.");
    }
    await audit("auth.password_changed", session.userId, headers);
    await send(passwordChangedMessage(session.email, session.name));
    return authOk(undefined);
  }

  /**
   * Resolves the session from request headers. Enforces realm, absolute
   * lifetime and account status on every call (docs 04 §4).
   */
  async getSession(headers: Headers): Promise<AuthSession | null> {
    let result: Awaited<ReturnType<BetterAuthInstance["api"]["getSession"]>>;
    try {
      result = await this.auth.api.getSession({ headers, query: { disableCookieCache: true } });
    } catch {
      return null;
    }
    if (!result) return null;
    const { session, user } = result;
    const realm = (session as { realm?: string }).realm;
    if (realm !== this.realm) return null;
    const createdAt = new Date(session.createdAt);
    if (Date.now() - createdAt.getTime() > this.policy.absoluteSeconds * 1000) {
      await systemDb().session.deleteMany({ where: { id: session.id } });
      return null;
    }
    const status = (user as { status?: string }).status;
    if (status !== "ACTIVE" || !user.emailVerified) return null;
    if (this.realm === "PLATFORM" && !(await sessionAllowed("PLATFORM", user.id))) return null;
    const reauth = (session as { reauthenticatedAt?: Date | string | null }).reauthenticatedAt;
    return {
      sessionId: session.id,
      realm: this.realm,
      userId: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt,
      reauthenticatedAt: reauth ? new Date(reauth) : null,
    };
  }

  /**
   * For request interception (Next.js proxy): validates the session and
   * returns Set-Cookie headers when the sliding expiry was extended.
   */
  async refreshSession(headers: Headers): Promise<{ valid: boolean; setCookies: string[] }> {
    try {
      const result = await this.auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
        returnHeaders: true,
      });
      const realm = (result.response?.session as { realm?: string } | undefined)?.realm;
      return {
        valid: result.response !== null && realm === this.realm,
        setCookies: result.headers.getSetCookie(),
      };
    } catch {
      return { valid: false, setCookies: [] };
    }
  }

  async listSessions(session: AuthSession): Promise<SessionSummary[]> {
    const rows = await systemDb().session.findMany({
      where: { userId: session.userId, realm: this.realm, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true, updatedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      current: row.id === session.sessionId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      lastActiveAt: row.updatedAt,
    }));
  }

  /** Revokes one of the caller's own sessions (never another user's). */
  async revokeSession(session: AuthSession, sessionId: string, headers: Headers): Promise<boolean> {
    const { count } = await systemDb().session.deleteMany({
      where: { id: sessionId, userId: session.userId, realm: this.realm },
    });
    if (count > 0) await audit("auth.session_revoked", session.userId, headers);
    return count > 0;
  }

  async revokeOtherSessions(session: AuthSession, headers: Headers): Promise<number> {
    const { count } = await systemDb().session.deleteMany({
      where: { userId: session.userId, realm: this.realm, id: { not: session.sessionId } },
    });
    if (count > 0) await audit("auth.other_sessions_revoked", session.userId, headers);
    return count;
  }

  /** Step-up re-authentication: verifies the password and stamps the session. */
  async confirmPassword(
    session: AuthSession,
    password: unknown,
    headers: Headers,
  ): Promise<AuthResult> {
    const blocked = await this.limited([[RATE_LIMITS.confirmPasswordUser, session.userId]]);
    if (blocked) return blocked;
    const parsed = z.string().min(1).max(128).safeParse(password);
    const account = await systemDb().account.findFirst({
      where: { userId: session.userId, providerId: "credential" },
      select: { passwordHash: true },
    });
    const ok =
      parsed.success && account?.passwordHash
        ? await verifyPassword(account.passwordHash, parsed.data)
        : false;
    if (!ok) return authFail("INVALID_CREDENTIALS", "That password is incorrect.");
    await systemDb().session.update({
      where: { id: session.sessionId },
      data: { reauthenticatedAt: new Date() },
    });
    await audit("auth.reauthenticated", session.userId, headers);
    return authOk(undefined);
  }

  private mapError(error: unknown, fallback: AuthErrorCode, message: string): AuthResult<never> {
    const code = apiErrorCode(error);
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
      return authFail("INVALID_INPUT", "Use 10-128 characters for your password.");
    }
    return authFail(fallback, message);
  }
}

/** True when the session re-authenticated within `maxAgeSeconds` (default 10 min). */
export function hasRecentAuth(session: AuthSession, maxAgeSeconds = 10 * 60): boolean {
  return (
    session.reauthenticatedAt !== null &&
    Date.now() - session.reauthenticatedAt.getTime() <= maxAgeSeconds * 1000
  );
}
