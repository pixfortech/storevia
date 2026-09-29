import { createHash, randomBytes } from "node:crypto";

/**
 * Email change (DB-4): the pieces that don't touch the database, so they can
 * be unit tested. A request is one `Verification` row:
 *
 *   identifier = sha256("change-email:" + token), base64url (never the token)
 *   value      = "change-email:<userId>:<requesting sessionId>:<new email>"
 *
 * The token itself only ever exists in the link sent to the new address.
 */

const PREFIX = "change-email";

/** How long a change link works (once). */
export const EMAIL_CHANGE_TTL_SECONDS = 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

/** A fresh 256-bit link token. */
export function newEmailChangeToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Whether a string could be a token we issued (cheap check before any lookup). */
export function isWellFormedEmailChangeToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

/** The stored identifier for a token (namespaced so it never collides with Better Auth's). */
export function emailChangeIdentifier(token: string): string {
  return createHash("sha256").update(`${PREFIX}:${token}`).digest("base64url");
}

/** Prefix of every value belonging to one user (to list or cancel their request). */
export function emailChangeValuePrefix(userId: string): string {
  return `${PREFIX}:${userId}:`;
}

export interface EmailChangeRequest {
  readonly userId: string;
  /** The session that asked; it stays signed in when the change completes. */
  readonly sessionId: string;
  readonly email: string;
}

export function encodeEmailChange(request: EmailChangeRequest): string {
  if (!UUID.test(request.userId) || !UUID.test(request.sessionId)) {
    throw new Error("email change: malformed ids");
  }
  return `${emailChangeValuePrefix(request.userId)}${request.sessionId}:${request.email}`;
}

/** Parses a stored value; null for anything that isn't an email-change row. */
export function decodeEmailChange(value: string): EmailChangeRequest | null {
  const match = /^change-email:([0-9a-f-]{36}):([0-9a-f-]{36}):(.+@.+)$/i.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  if (!UUID.test(match[1]) || !UUID.test(match[2])) return null;
  return { userId: match[1], sessionId: match[2], email: match[3] };
}

/**
 * "asha@example.com" → "a•••@example.com": enough for the owner to recognise
 * an address, without writing it out in audit entries or notices.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
