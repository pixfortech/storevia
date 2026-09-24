import { isIP } from "node:net";

/**
 * Client IP for rate limiting and audit. Forwarding headers are trusted only
 * when TRUSTED_CLIENT_IP_HEADER names the header our edge sets (e.g.
 * cf-connecting-ip); otherwise a client could spoof its own address. For
 * list-valued headers (x-forwarded-for) the RIGHT-most entry is used: it is
 * the address our trusted proxy appended, while earlier entries are
 * client-controlled. Staging and production must configure the header
 * (enforced by the apps' env validation).
 */
export function clientIp(headers: Headers): string | null {
  const trusted = process.env["TRUSTED_CLIENT_IP_HEADER"];
  if (trusted) {
    const raw = headers.get(trusted)?.split(",").at(-1)?.trim();
    if (raw && isIP(raw)) return raw;
  }
  // Unknown: callers must not bucket all such requests under one key (that
  // would turn a per-IP limit into a global one).
  return null;
}

export function userAgent(headers: Headers): string | null {
  return headers.get("user-agent")?.slice(0, 512) ?? null;
}
