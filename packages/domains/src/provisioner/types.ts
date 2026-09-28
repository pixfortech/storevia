// The hosting-provider boundary (ADR-0032 §2): the one place that knows how
// a custom domain reaches the storefront deployment and gets a certificate.
// Control plane only — a shopper request never calls it.

/** A DNS record the merchant must create (shown in the dashboard). */
export interface DnsRecord {
  readonly type: "A" | "AAAA" | "CNAME" | "TXT";
  /** Fully qualified record name, e.g. "www.abc.com" or "_storevia-verification.abc.com". */
  readonly name: string;
  readonly value: string;
  /** What the record is for, so the dashboard can explain it. */
  readonly purpose: "ownership" | "routing" | "provider-verification";
}

/** What the provider says about a domain, reduced to what Storevia needs. */
export interface ProviderDomainStatus {
  /** The domain is on Storevia's provider project. */
  readonly registered: boolean;
  /** Stable provider reference (stored as StoreDomain.providerRef). */
  readonly ref: string | null;
  /** The provider accepts that Storevia may serve it (its own challenge, if any, passed). */
  readonly verified: boolean;
  /** DNS points at the provider. */
  readonly configured: boolean;
  /** HTTPS readiness: the provider issues and renews certificates itself. */
  readonly certificate: "pending" | "ready";
  /** Routing records, and the provider's own verification records when it asks for them. */
  readonly records: readonly DnsRecord[];
}

export type ProvisionerErrorKind = "timeout" | "unavailable" | "conflict" | "invalid";

/**
 * A provider failure, typed and without the provider's payload: `conflict`
 * (the domain belongs to another provider account), `timeout`,
 * `unavailable` (5xx, rate limited, unreachable) or `invalid` (a response
 * we couldn't read). Messages are safe to log; they never hold tokens.
 */
export class ProvisionerError extends Error {
  constructor(
    readonly kind: ProvisionerErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProvisionerError";
  }
}

export interface DomainProvisioner {
  readonly key: "local" | "vercel";
  /** Adds the domain to Storevia's project. Idempotent: already ours is success. */
  addDomain(hostname: string): Promise<ProviderDomainStatus>;
  /** Removes the domain from Storevia's project. Idempotent: already gone is success. */
  removeDomain(hostname: string): Promise<void>;
  /** The provider's current view (never throws for "not registered": `registered: false`). */
  getDomainStatus(hostname: string): Promise<ProviderDomainStatus>;
  /** Asks the provider to re-check its own verification challenge (no-op when there is none). */
  verifyDomain(hostname: string): Promise<ProviderDomainStatus>;
  /** TXT values published at `name` (Storevia's ownership proof). Empty when none. */
  lookupTxt(name: string): Promise<readonly string[]>;
}
