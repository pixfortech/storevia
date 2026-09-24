import { isIP } from "node:net";

/**
 * Client IP for rate limiting and audit. Forwarding headers are trusted only
 * when TRUSTED_CLIENT_IP_HEADER names the header our edge sets (e.g.
 * cf-connecting-ip); otherwise a client could spoof its own address.
 */
export function clientIp(headers: Headers): string {
  const trusted = process.env["TRUSTED_CLIENT_IP_HEADER"];
  if (trusted) {
    const raw = headers.get(trusted)?.split(",")[0]?.trim();
    if (raw && isIP(raw)) return raw;
  }
  return "unknown";
}

export function userAgent(headers: Headers): string | null {
  return headers.get("user-agent")?.slice(0, 512) ?? null;
}
