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
    // Behind N trusted proxies that each append (x-forwarded-for), the
    // client is the N-th entry from the right (M8; default 1).
    const hops = Math.min(Math.max(Number(process.env["TRUSTED_PROXY_HOPS"] ?? 1) || 1, 1), 5);
    const raw = headers.get(trusted)?.split(",").at(-hops)?.trim();
    if (raw && isIP(raw)) return raw;
  }
  // Unknown: callers must not bucket all such requests under one key (that
  // would turn a per-IP limit into a global one).
  return null;
}

export function userAgent(headers: Headers): string | null {
  return headers.get("user-agent")?.slice(0, 512) ?? null;
}

/**
 * The rate-limit bucket for an address (M8): an IPv4 address as is, an IPv6
 * address by its /64 (one subscriber usually holds a whole /64, so a
 * per-address limit is trivially rotated around).
 */
export function ipBucket(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  // A mapped IPv4 address (::ffff:1.2.3.4) is that IPv4 address.
  const last = right.at(-1) ?? left.at(-1) ?? "";
  if (isIP(last) === 4) return last;
  const groups = ip.includes("::")
    ? [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
