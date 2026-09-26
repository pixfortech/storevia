// Hostname normalisation (06-storefront.md §2, ADR-0028 §12). Every storefront
// request's Host header goes through here before any lookup: lower-case, no
// port, no trailing dot, IDNA to ASCII (punycode), RFC 1123 labels, at most
// 253 characters, and never an IP literal. Anything else is "no store".
import { domainToASCII } from "node:url";

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PORT_RE = /^\d{1,5}$/;

export function normaliseHostname(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let host = raw.trim();
  if (host.length === 0 || host.length > 300) return null;
  // IPv6 literals ("[::1]:3000") are never store hosts.
  if (host.startsWith("[")) return null;
  const colon = host.lastIndexOf(":");
  if (colon !== -1) {
    if (!PORT_RE.test(host.slice(colon + 1))) return null;
    host = host.slice(0, colon);
  }
  if (host.includes(":")) return null;
  host = host.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  // Letters (any script, for IDNs), digits, hyphens and dots only: URL
  // parsing would otherwise stop at "/", "?", "@" or "#" and accept a prefix.
  if (!/^[\p{L}\p{M}\p{N}.-]+$/u.test(host)) return null;
  // domainToASCII returns "" for anything that isn't a valid domain.
  const ascii = domainToASCII(host);
  if (!ascii || ascii.length > 253) return null;
  const labels = ascii.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL_RE.test(label))) return null;
  // A numeric last label means an IPv4 literal ("127.0.0.1", "127.1", "0x7f.1" → "127.0.0.1").
  if (/^\d+$/.test(labels.at(-1) ?? "")) return null;
  return ascii;
}

/**
 * The platform root domain (STOREFRONT_ROOT_DOMAIN, e.g. "storevia.site";
 * development values may carry a port, which never takes part in matching).
 */
export function storefrontRootDomain(env: NodeJS.ProcessEnv = process.env): string {
  return normaliseHostname(env["STOREFRONT_ROOT_DOMAIN"] ?? "storevia.site") ?? "storevia.site";
}

/** `{slug}.{root}` for a store slug (slugs are validated by store creation). */
export function platformHostname(slug: string, root: string = storefrontRootDomain()): string {
  return `${slug}.${root}`;
}

/**
 * The public origin of a storefront host: https unless STOREFRONT_PROTOCOL
 * says otherwise (plain-HTTP development), with the development port that
 * STOREFRONT_ROOT_DOMAIN carries, if any.
 */
export function storefrontOrigin(hostname: string, env: NodeJS.ProcessEnv = process.env): string {
  const protocol = env["STOREFRONT_PROTOCOL"] === "http" ? "http" : "https";
  const port = /:(\d{1,5})$/.exec(env["STOREFRONT_ROOT_DOMAIN"] ?? "")?.[1];
  return `${protocol}://${hostname}${port ? `:${port}` : ""}`;
}
