import "server-only";
import { systemDb } from "@storevia/database/system";
import {
  accountDeletedMessage,
  confirmEmailChangeMessage,
  emailChangeAddressInUseMessage,
  emailChangedMessage,
  existingAccountMessage,
  getEmailSender,
  passwordChangedMessage,
  resetPasswordMessage,
  verifyEmailMessage,
  type EmailMessage,
} from "@storevia/email";
import {
  completeEnrolment,
  mfaState,
  recoveryCodesLeft,
  startEnrolment,
  verifySecondFactor,
} from "./mfa";
import {
  clientIp,
  ipBucket,
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
import {
  EMAIL_CHANGE_TTL_SECONDS,
  decodeEmailChange,
  emailChangeIdentifier,
  emailChangeValuePrefix,
  encodeEmailChange,
  isWellFormedEmailChangeToken,
  maskEmail,
  newEmailChangeToken,
} from "./email-change";
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
  /** Where account notices send people for help (optional; plain text otherwise). */
  readonly supportUrl?: string | undefined;
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

/** The client's rate-limit bucket (IPv6 by /64), or null when unknown. */
function clientKey(headers: Headers): string | null {
  const ip = clientIp(headers);
  return ip ? ipBucket(ip) : null;
}

const RATE_LIMITS = {
  signInIp: { name: "auth:sign-in:ip", limit: 30, windowSeconds: 5 * 60 },
  // Per realm (a dashboard sign-in never spends a staff member's platform
  // budget) and per client: one address can't lock an account out; many
  // addresses together get a bounded number of guesses (M8).
  signInEmailClient: { name: "auth:sign-in:email-client", limit: 10, windowSeconds: 15 * 60 },
  signInEmail: { name: "auth:sign-in:email", limit: 50, windowSeconds: 15 * 60 },
  signUpIp: { name: "auth:sign-up:ip", limit: 10, windowSeconds: HOUR },
  // Bounds "account already exists" emails to one address (email bombing).
  signUpEmail: { name: "auth:sign-up:email", limit: 3, windowSeconds: HOUR },
  resetRequestEmail: { name: "auth:reset-request:email", limit: 3, windowSeconds: HOUR },
  resetRequestIp: { name: "auth:reset-request:ip", limit: 10, windowSeconds: HOUR },
  resetSubmitIp: { name: "auth:reset-submit:ip", limit: 20, windowSeconds: HOUR },
  verifyResendEmail: { name: "auth:verify-resend:email", limit: 3, windowSeconds: HOUR },
  verifyResendIp: { name: "auth:verify-resend:ip", limit: 10, windowSeconds: HOUR },
  verifySubmitIp: { name: "auth:verify-submit:ip", limit: 30, windowSeconds: HOUR },
  confirmPasswordUser: { name: "auth:confirm-password:user", limit: 10, windowSeconds: 15 * 60 },
  mfaUser: { name: "auth:mfa:user", limit: 10, windowSeconds: 15 * 60 },
  changePasswordUser: { name: "auth:change-password:user", limit: 10, windowSeconds: HOUR },
  profileUser: { name: "auth:profile:user", limit: 20, windowSeconds: HOUR },
  // Email change (DB-4): per account, per client, and per new address (the
  // latter bounds how many links or "already in use" notices one inbox gets).
  emailChangeUser: { name: "auth:email-change:user", limit: 3, windowSeconds: HOUR },
  emailChangeIp: { name: "auth:email-change:ip", limit: 10, windowSeconds: HOUR },
  emailChangeAddress: { name: "auth:email-change:address", limit: 3, windowSeconds: HOUR },
  emailChangeConfirmIp: { name: "auth:email-change-confirm:ip", limit: 30, windowSeconds: HOUR },
} satisfies Record<string, RateLimitRule>;

const signUpSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
const signInSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

const GENERIC_SIGN_IN_ERROR = "Email or password is incorrect.";
const INVALID_EMAIL_CHANGE_LINK = "This link is invalid, has expired or has already been used.";

export interface PendingEmailChange {
  /** The address waiting to be confirmed. */
  readonly email: string;
  readonly expiresAt: Date;
}

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

/** A unique-constraint violation (Prisma P2002), e.g. an email taken meanwhile. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
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
        deletedAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: policy.idleSeconds,
      updateAge: policy.refreshSeconds,
      cookieCache: { enabled: false },
      additionalFields: {
        realm: { type: "string", required: false, input: false, defaultValue: options.realm },
        reauthenticatedAt: { type: "date", required: false, input: false },
        mfaVerifiedAt: { type: "date", required: false, input: false },
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

  private readonly secret: string;
  private readonly supportUrl: string | undefined;

  constructor(options: AuthServiceOptions) {
    this.secret = options.secret;
    // An empty value (an unset env var) means no link.
    this.supportUrl = options.supportUrl?.trim() === "" ? undefined : options.supportUrl;
    this.realm = options.realm;
    this.policy = POLICIES[options.realm];
    this.baseURL = options.baseURL.replace(/\/$/, "");
    this.auth = buildBetterAuth(options);
  }

  private async limited(
    checks: readonly (readonly [RateLimitRule, string | null])[],
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
    const blocked = await this.limited([
      [RATE_LIMITS.signUpIp, clientKey(headers)],
      [RATE_LIMITS.signUpEmail, parsed.data.email],
    ]);
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
      [RATE_LIMITS.signInIp, clientKey(headers)],
      [
        RATE_LIMITS.signInEmailClient,
        `${this.realm}:${parsed.data.email}:${clientKey(headers) ?? "unknown"}`,
      ],
      [RATE_LIMITS.signInEmail, `${this.realm}:${parsed.data.email}`],
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
    const blocked = await this.limited([[RATE_LIMITS.verifySubmitIp, clientKey(headers)]]);
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
    const blocked = await this.limited([
      [RATE_LIMITS.verifyResendIp, clientKey(headers)],
      [RATE_LIMITS.verifyResendEmail, parsed.data],
    ]);
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
      [RATE_LIMITS.resetRequestIp, clientKey(headers)],
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
    const blocked = await this.limited([[RATE_LIMITS.resetSubmitIp, clientKey(headers)]]);
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
    const deletedAt = (user as { deletedAt?: Date | string | null }).deletedAt;
    if (status !== "ACTIVE" || deletedAt || !user.emailVerified) return null;
    if (this.realm === "PLATFORM" && !(await sessionAllowed("PLATFORM", user.id))) return null;
    const reauth = (session as { reauthenticatedAt?: Date | string | null }).reauthenticatedAt;
    const mfaAt = (session as { mfaVerifiedAt?: Date | string | null }).mfaVerifiedAt;
    return {
      sessionId: session.id,
      realm: this.realm,
      userId: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt,
      reauthenticatedAt: reauth ? new Date(reauth) : null,
      mfaVerifiedAt: mfaAt ? new Date(mfaAt) : null,
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

  /**
   * Deletes the caller's own dashboard account (M8, data-lifecycle.md): the
   * password again and the account's email typed out. Refused while the
   * user owns an organisation (transfer or delete it first). Memberships,
   * sessions and credentials go; the user row stays as an anonymous
   * tombstone so audit entries and order history keep a valid actor.
   */
  async deleteAccount(
    session: AuthSession,
    input: { readonly password: unknown; readonly confirmEmail: unknown },
    headers: Headers,
  ): Promise<AuthResult> {
    if (this.realm !== "DASHBOARD") throw new Error("account deletion is for the dashboard realm");
    const blocked = await this.limited([[RATE_LIMITS.confirmPasswordUser, session.userId]]);
    if (blocked) return blocked;
    const typed = typeof input.confirmEmail === "string" ? input.confirmEmail.trim() : "";
    if (typed.toLowerCase() !== session.email.toLowerCase()) {
      return authFail("INVALID_INPUT", "Type your account's email address exactly.");
    }
    const parsed = z.string().min(1).max(128).safeParse(input.password);
    const account = await systemDb().account.findFirst({
      where: { userId: session.userId, providerId: "credential" },
      select: { passwordHash: true },
    });
    const ok =
      parsed.success && account?.passwordHash
        ? await verifyPassword(account.passwordHash, parsed.data)
        : false;
    if (!ok) return authFail("INVALID_CREDENTIALS", "That password is incorrect.");
    const [row] = await systemDb().$queryRaw<{ outcome: string }[]>`
      SELECT app_delete_user_account(${session.userId}::uuid) AS outcome`;
    switch (row?.outcome) {
      case "deleted":
        await systemDb().verification.deleteMany({
          where: { value: { startsWith: emailChangeValuePrefix(session.userId) } },
        });
        await audit("auth.account_deleted", session.userId, headers);
        await send(accountDeletedMessage(session.email, session.name));
        return authOk(undefined);
      case "owns_organisation":
        return authFail(
          "ACCOUNT_IN_USE",
          "You own an organisation. Transfer its ownership or delete it before deleting your account.",
        );
      default:
        return authFail("ACCOUNT_IN_USE", "This account can't be deleted here.");
    }
  }

  // -------------------------------------------------------------------------
  // Profile (DB-4): the dashboard user's own name and email address. Platform
  // staff manage their identity through operations, not here.
  // -------------------------------------------------------------------------

  /** Renames the caller (trimmed, inner whitespace collapsed, 1-100 characters). */
  async updateName(
    session: AuthSession,
    name: unknown,
    headers: Headers,
  ): Promise<AuthResult<{ name: string }>> {
    this.dashboardOnly("profile changes");
    const parsed = personNameSchema.safeParse(typeof name === "string" ? name : "");
    if (!parsed.success)
      return authFail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Enter your name.");
    const blocked = await this.limited([[RATE_LIMITS.profileUser, session.userId]]);
    if (blocked) return blocked;
    if (parsed.data !== session.name) {
      await systemDb().user.update({
        where: { id: session.userId },
        data: { name: parsed.data },
      });
      await audit("auth.profile_updated", session.userId, headers, { fields: "name" });
    }
    return authOk({ name: parsed.data });
  }

  /**
   * Starts an email change: needs a recent password confirmation (step-up),
   * then emails a single-use link to the NEW address. The account's email
   * changes only when that link is used (confirmEmailChange). An address that
   * already has an account gets the same answer here, like sign-up: the
   * request is recorded but its link is never sent, so it can't complete,
   * and the address's owner gets a notice instead.
   */
  async requestEmailChange(
    session: AuthSession,
    newEmail: unknown,
    headers: Headers,
  ): Promise<AuthResult<PendingEmailChange>> {
    this.dashboardOnly("email changes");
    if (!hasRecentAuth(session)) {
      return authFail(
        "REAUTHENTICATION_REQUIRED",
        "Confirm your password before changing your email address.",
      );
    }
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) {
      return authFail(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      );
    }
    const email = parsed.data;
    const same = authFail("INVALID_INPUT", "That's already your email address.");
    if (email === session.email.toLowerCase()) return same;
    const blocked = await this.limited([
      [RATE_LIMITS.emailChangeUser, session.userId],
      [RATE_LIMITS.emailChangeIp, clientKey(headers)],
      [RATE_LIMITS.emailChangeAddress, email],
    ]);
    if (blocked) return blocked;

    const db = systemDb();
    const staff = await db.platformStaff.findUnique({
      where: { userId: session.userId },
      select: { userId: true },
    });
    if (staff) {
      return authFail(
        "NOT_ALLOWED",
        "Platform staff accounts change their email address through Storevia operations.",
      );
    }
    // citext: the lookup ignores case, like the unique constraint.
    const holder = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, deletedAt: true },
    });
    if (holder?.id === session.userId) return same;

    const token = newEmailChangeToken();
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_SECONDS * 1000);
    // One request at a time: a new one replaces any earlier link.
    await db.$transaction([
      db.verification.deleteMany({
        where: { value: { startsWith: emailChangeValuePrefix(session.userId) } },
      }),
      db.verification.create({
        data: {
          identifier: emailChangeIdentifier(token),
          value: encodeEmailChange({ userId: session.userId, sessionId: session.sessionId, email }),
          expiresAt,
        },
      }),
    ]);
    if (!holder) {
      await send(
        confirmEmailChangeMessage(
          email,
          session.name,
          session.email,
          `${this.baseURL}/confirm-email-change?token=${encodeURIComponent(token)}`,
        ),
      );
    } else if (!holder.deletedAt) {
      await send(
        emailChangeAddressInUseMessage(holder.email, holder.name, `${this.baseURL}/sign-in`),
      );
    }
    await audit("auth.email_change_requested", session.userId, headers, { to: maskEmail(email) });
    return authOk({ email, expiresAt });
  }

  /** The caller's email change waiting for confirmation, if any. */
  async pendingEmailChange(session: AuthSession): Promise<PendingEmailChange | null> {
    const row = await systemDb().verification.findFirst({
      where: {
        value: { startsWith: emailChangeValuePrefix(session.userId) },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { value: true, expiresAt: true },
    });
    const request = row ? decodeEmailChange(row.value) : null;
    return row && request ? { email: request.email, expiresAt: row.expiresAt } : null;
  }

  /** Withdraws the caller's pending email change (its link stops working). */
  async cancelEmailChange(session: AuthSession, headers: Headers): Promise<boolean> {
    const { count } = await systemDb().verification.deleteMany({
      where: { value: { startsWith: emailChangeValuePrefix(session.userId) } },
    });
    if (count > 0) await audit("auth.email_change_cancelled", session.userId, headers);
    return count > 0;
  }

  /** What an email-change link would do, without using it (for its landing page). */
  async previewEmailChange(token: unknown): Promise<PendingEmailChange | null> {
    const found = await this.findEmailChange(token);
    return found ? { email: found.request.email, expiresAt: found.expiresAt } : null;
  }

  /**
   * Completes an email change from the emailed link: once, before it
   * expires. The new address becomes the verified sign-in email; links sent
   * to the old address stop working; every other dashboard session (except
   * the one that asked, and this browser's own) is signed out; and the old
   * address is told. Platform sessions are never touched.
   */
  async confirmEmailChange(
    token: unknown,
    headers: Headers,
  ): Promise<AuthResult<{ email: string }>> {
    this.dashboardOnly("email changes");
    const blocked = await this.limited([[RATE_LIMITS.emailChangeConfirmIp, clientKey(headers)]]);
    if (blocked) return blocked;
    const found = await this.findEmailChange(token);
    if (!found) return authFail("INVALID_TOKEN", INVALID_EMAIL_CHANGE_LINK);
    const { userId, sessionId, email } = found.request;
    const db = systemDb();

    let previous: { email: string; name: string } | null = null;
    try {
      previous = await db.$transaction(async (tx) => {
        // Single use: only the request that deletes the row goes on.
        const { count } = await tx.verification.deleteMany({ where: { id: found.id } });
        if (count !== 1) return null;
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            name: true,
            status: true,
            deletedAt: true,
            platformStaff: { select: { userId: true } },
          },
        });
        if (user?.status !== "ACTIVE" || user.deletedAt || user.platformStaff) return null;
        await tx.user.update({ where: { id: userId }, data: { email, emailVerified: true } });
        return { email: user.email, name: user.name };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The address was registered after the request: the link is spent.
      await db.verification.deleteMany({ where: { id: found.id } });
    }
    if (!previous) return authFail("INVALID_TOKEN", INVALID_EMAIL_CHANGE_LINK);

    const current = await this.getSession(headers);
    const keep = [sessionId, ...(current?.userId === userId ? [current.sessionId] : [])];
    // Password-reset links (Better Auth keys them by user id) went to the old address.
    await db.verification.deleteMany({ where: { value: userId } });
    const { count: revoked } = await db.session.deleteMany({
      where: { userId, realm: this.realm, id: { notIn: keep } },
    });
    await audit("auth.email_changed", userId, headers, {
      from: maskEmail(previous.email),
      to: maskEmail(email),
      sessionsRevoked: String(revoked),
    });
    await send(
      emailChangedMessage(previous.email, previous.name, maskEmail(email), this.supportUrl),
    );
    return authOk({ email });
  }

  private async findEmailChange(token: unknown) {
    if (!isWellFormedEmailChangeToken(token)) return null;
    const row = await systemDb().verification.findFirst({
      where: { identifier: emailChangeIdentifier(token), expiresAt: { gt: new Date() } },
      select: { id: true, value: true, expiresAt: true },
    });
    const request = row ? decodeEmailChange(row.value) : null;
    return row && request ? { id: row.id, expiresAt: row.expiresAt, request } : null;
  }

  private dashboardOnly(what: string): void {
    if (this.realm !== "DASHBOARD") throw new Error(`${what} are for the dashboard realm`);
  }

  // -------------------------------------------------------------------------
  // Platform staff MFA (M8, ADR-0035). A platform session is usable only once
  // its second factor is verified (session.mfaVerifiedAt).
  // -------------------------------------------------------------------------

  /** Whether the staff member has enrolled an authenticator. */
  async mfaStatus(session: AuthSession): Promise<{ enrolled: boolean; recoveryCodesLeft: number }> {
    this.platformOnly();
    const { enrolled } = await mfaState(session.userId);
    return { enrolled, recoveryCodesLeft: enrolled ? await recoveryCodesLeft(session.userId) : 0 };
  }

  /** A new authenticator secret to scan (only before enrolment is complete). */
  async startMfaEnrolment(
    session: AuthSession,
  ): Promise<AuthResult<{ secret: string; uri: string }>> {
    this.platformOnly();
    const started = await startEnrolment(session.userId, session.email, this.secret);
    if (!started) return authFail("INVALID_INPUT", "Two-step verification is already set up.");
    return authOk(started);
  }

  /** Confirms enrolment with a first code; the session counts as verified. */
  async completeMfaEnrolment(
    session: AuthSession,
    code: unknown,
    headers: Headers,
  ): Promise<AuthResult<{ recoveryCodes: readonly string[] }>> {
    this.platformOnly();
    const blocked = await this.limited([[RATE_LIMITS.mfaUser, session.userId]]);
    if (blocked) return blocked;
    const codes =
      typeof code === "string" ? await completeEnrolment(session.userId, code, this.secret) : null;
    if (!codes)
      return authFail(
        "INVALID_TOKEN",
        "That code didn't match. Check the time on your device and try again.",
      );
    await this.markMfaVerified(session);
    await audit("auth.platform.mfa_enrolled", session.userId, headers);
    return authOk({ recoveryCodes: codes });
  }

  /** Verifies this sign-in's second factor (authenticator or recovery code). */
  async verifyMfa(session: AuthSession, code: unknown, headers: Headers): Promise<AuthResult> {
    this.platformOnly();
    const blocked = await this.limited([[RATE_LIMITS.mfaUser, session.userId]]);
    if (blocked) return blocked;
    const method =
      typeof code === "string" && code.length <= 32
        ? await verifySecondFactor(session.userId, code, this.secret)
        : null;
    if (!method) {
      await audit("auth.platform.mfa_failed", session.userId, headers);
      return authFail("INVALID_TOKEN", "That code didn't match. Try the next code from your app.");
    }
    await this.markMfaVerified(session);
    await audit("auth.platform.mfa_verified", session.userId, headers, { method });
    return authOk(undefined);
  }

  private async markMfaVerified(session: AuthSession): Promise<void> {
    await systemDb().session.update({
      where: { id: session.sessionId },
      data: { mfaVerifiedAt: new Date() },
    });
  }

  private platformOnly(): void {
    if (this.realm !== "PLATFORM") throw new Error("staff MFA is for the platform realm");
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
