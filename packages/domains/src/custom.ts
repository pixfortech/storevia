import { normaliseHostname, storefrontRootDomain } from "./hostname";

// Custom domains (ADR-0032): the hostname policy for a merchant's own domain,
// the ownership record, the verification schedule and the reason codes the
// dashboard turns into copy. No I/O here: the services and the worker share
// these rules.

/** Storevia's ownership proof lives at this label under the merchant's host. */
export const OWNERSHIP_LABEL = "_storevia-verification";
export const OWNERSHIP_PREFIX = "storevia-verification=";

export const ownershipRecordName = (hostname: string) => `${OWNERSHIP_LABEL}.${hostname}`;
export const ownershipRecordValue = (token: string) => `${OWNERSHIP_PREFIX}${token}`;

/** Why a domain isn't active (StoreDomain.failureReason). */
export const DOMAIN_REASONS = {
  provider_error: "The hosting provider couldn't add this domain. We'll keep trying.",
  provider_conflict:
    "This domain is connected to another hosting account. Remove it there, then check again.",
  dns_txt_missing: "The verification record hasn't been found yet.",
  dns_routing_missing: "The domain doesn't point to Storevia yet.",
  certificate_pending: "Setting up HTTPS. This usually takes a few minutes.",
  verification_timeout: "Domain verification failed. Check the DNS records, then check again.",
  dns_lost: "This domain no longer points to Storevia. Check its DNS records.",
} as const;
export type DomainReason = keyof typeof DOMAIN_REASONS;

export function isDomainReason(value: unknown): value is DomainReason {
  return typeof value === "string" && Object.hasOwn(DOMAIN_REASONS, value);
}

// ---------------------------------------------------------------------------
// Schedule: checks back off while waiting for DNS; active domains are
// re-checked a few times a day and fail only after a persistent problem.
// ---------------------------------------------------------------------------

const MINUTE = 60_000;

/** Checks before a waiting domain is FAILED (about 3½ days). */
export const MAX_VERIFY_ATTEMPTS = 80;
/** How often an ACTIVE custom domain is re-checked. */
export const MONITOR_INTERVAL_MS = 6 * 60 * MINUTE;
/** Consecutive failed checks before an ACTIVE domain is FAILED (about 3 days). */
export const MONITOR_FAILURE_LIMIT = 12;

/**
 * The wait between checks of a domain that isn't active yet: [below this
 * many attempts, wait minutes], then VERIFY_BACKOFF_FINAL_MINUTES. The
 * worker's due-query is built from the same table.
 */
export const VERIFY_BACKOFF: readonly (readonly [attemptsBelow: number, minutes: number])[] = [
  [10, 1],
  [22, 5],
  [45, 30],
];
export const VERIFY_BACKOFF_FINAL_MINUTES = 120;

/** The wait after `attempts` checks of a domain that isn't active yet. */
export function verifyDelayMs(attempts: number): number {
  const step = VERIFY_BACKOFF.find(([below]) => attempts < below);
  return (step ? step[1] : VERIFY_BACKOFF_FINAL_MINUTES) * MINUTE;
}

// ---------------------------------------------------------------------------
// Hostname policy.
// ---------------------------------------------------------------------------

/** Suffixes that are never public domains (RFC 6761, RFC 6762, RFC 8375). */
const SPECIAL_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "invalid",
  "home.arpa",
  "arpa",
  "onion",
];
/** Reserved for testing (RFC 2606): only the local simulator accepts them. */
const TEST_SUFFIXES = ["test", "example"];

const endsWith = (host: string, suffix: string) => host === suffix || host.endsWith(`.${suffix}`);

const hostOf = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return normaliseHostname(new URL(url).host);
  } catch {
    return null;
  }
};

/** A host and, for a subdomain, its parent ("app.storevia.com" → also "storevia.com"). */
const withParent = (host: string | null): string[] => {
  if (!host) return [];
  const labels = host.split(".");
  return labels.length > 2 ? [host, labels.slice(1).join(".")] : [host];
};

/** Storevia's own domains: the storefront root and the app, marketing and admin hosts. */
export function storeviaOwnedDomains(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    ...new Set([
      storefrontRootDomain(env),
      ...withParent(hostOf(env["DASHBOARD_URL"])),
      ...withParent(hostOf(env["MARKETING_URL"])),
      ...withParent(hostOf(env["PLATFORM_ADMIN_URL"])),
      "storevia.site",
      "storevia.com",
    ]),
  ].filter((h) => !SPECIAL_SUFFIXES.some((s) => endsWith(h, s)));
}

export type CustomHostnameResult =
  | { readonly ok: true; readonly hostname: string }
  | { readonly ok: false; readonly message: string };

/**
 * A merchant's domain as typed ("abc.com", "www.abc.com", "shop.abc.com"):
 * no scheme, path, port or credentials, not an IP address, not a special-use
 * or Storevia-owned name. `allowTestDomains` is the local simulator's switch.
 */
export function parseCustomHostname(
  raw: unknown,
  options: { readonly allowTestDomains?: boolean; readonly env?: NodeJS.ProcessEnv } = {},
): CustomHostnameResult {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) return { ok: false, message: "Enter a domain, like shop.example.com." };
  if (input.length > 253) return { ok: false, message: "That domain is too long." };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) || /[/?#@\\]/.test(input) || /\s/.test(input)) {
    return {
      ok: false,
      message: "Enter just the domain, like shop.example.com, without https:// or a path.",
    };
  }
  if (input.startsWith("[") || /:\d*$/.test(input) || input.includes(":")) {
    return { ok: false, message: "Enter the domain without a port number." };
  }
  if (/^[\d.]+$/.test(input))
    return { ok: false, message: "Enter a domain name, not an IP address." };
  const hostname = normaliseHostname(input);
  if (!hostname) return { ok: false, message: "That isn't a valid domain name." };
  if (SPECIAL_SUFFIXES.some((s) => endsWith(hostname, s))) {
    return { ok: false, message: "That domain can't be used on the internet." };
  }
  if (TEST_SUFFIXES.some((s) => endsWith(hostname, s)) && !options.allowTestDomains) {
    return { ok: false, message: "That domain is reserved for testing." };
  }
  if (storeviaOwnedDomains(options.env).some((s) => endsWith(hostname, s))) {
    return { ok: false, message: "Storevia addresses can't be added as custom domains." };
  }
  return { ok: true, hostname };
}
