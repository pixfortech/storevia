import {
  isDomainReason,
  MAX_VERIFY_ATTEMPTS,
  MONITOR_FAILURE_LIMIT,
  ownershipRecordName,
  ownershipRecordValue,
  type DomainReason,
} from "../custom";
import {
  ProvisionerError,
  type DnsRecord,
  type DomainProvisioner,
  type ProviderDomainStatus,
} from "./types";

// One verification step for a custom domain (ADR-0032 §3–§5), shared by the
// worker and the merchant's "Check again". It asks the provider and DNS and
// returns the row's next state; the caller writes it under the row lock it
// already holds. ACTIVE needs both Storevia's ownership record and provider
// readiness (verified, routed, certificate). An ACTIVE domain that stops
// checking out stays ACTIVE (still served) and is FAILED only after a
// persistent problem.

export interface DomainSnapshot {
  readonly hostname: string;
  readonly status: "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";
  readonly verificationToken: string;
  readonly providerRef: string | null;
  readonly checkAttempts: number;
  readonly failureReason: string | null;
}

export interface DomainOutcome {
  readonly status: "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";
  readonly providerRef: string | null;
  readonly failureReason: DomainReason | null;
  readonly checkAttempts: number;
  /**
   * The records the merchant needs: Storevia's ownership record, then the
   * provider's. Null: unchanged (the provider couldn't be asked).
   */
  readonly dnsRecords: readonly DnsRecord[] | null;
  /** True when this step made the domain ACTIVE (set verifiedAt). */
  readonly becameActive: boolean;
  /** A provider failure worth a metric (never its payload). */
  readonly providerError: string | null;
}

export function ownershipRecord(hostname: string, token: string): DnsRecord {
  return {
    type: "TXT",
    name: ownershipRecordName(hostname),
    value: ownershipRecordValue(token),
    purpose: "ownership",
  };
}

async function ownershipProven(
  provisioner: DomainProvisioner,
  hostname: string,
  token: string,
): Promise<boolean> {
  const values = await provisioner.lookupTxt(ownershipRecordName(hostname));
  return values.map((v) => v.trim()).includes(ownershipRecordValue(token));
}

export async function evaluateDomain(
  domain: DomainSnapshot,
  provisioner: DomainProvisioner,
): Promise<DomainOutcome> {
  const own = ownershipRecord(domain.hostname, domain.verificationToken);
  const attempts = domain.checkAttempts + 1;
  const wasActive = domain.status === "ACTIVE";

  /** A check that didn't succeed: wait (or monitor), and fail once the budget is spent. */
  const notYet = (
    reason: DomainReason,
    extra: Partial<DomainOutcome> = {},
    records: readonly DnsRecord[] | null,
  ): DomainOutcome => {
    const exhausted = wasActive
      ? attempts >= MONITOR_FAILURE_LIMIT
      : attempts >= MAX_VERIFY_ATTEMPTS;
    return {
      status: exhausted ? "FAILED" : wasActive ? "ACTIVE" : (extra.status ?? "VERIFYING"),
      providerRef: extra.providerRef ?? domain.providerRef,
      failureReason: exhausted && !wasActive ? "verification_timeout" : reason,
      checkAttempts: attempts,
      dnsRecords: records,
      becameActive: false,
      providerError: extra.providerError ?? null,
    };
  };

  // 1. On the provider's project (registering again is idempotent: it also
  //    repairs a domain removed at the provider behind Storevia's back).
  let provider: ProviderDomainStatus;
  try {
    provider = await provisioner.getDomainStatus(domain.hostname);
    if (!provider.registered) provider = await provisioner.addDomain(domain.hostname);
    if (provider.registered && !provider.verified) {
      provider = await provisioner.verifyDomain(domain.hostname);
    }
  } catch (error) {
    if (error instanceof ProvisionerError) {
      const providerError = `${error.kind}: ${error.message}`;
      // An ACTIVE domain is served from Storevia's own data: a provider outage
      // neither interrupts it nor counts towards failing it.
      if (wasActive) {
        return {
          status: "ACTIVE",
          providerRef: domain.providerRef,
          failureReason: isDomainReason(domain.failureReason) ? domain.failureReason : null,
          checkAttempts: domain.checkAttempts,
          dnsRecords: null,
          becameActive: false,
          providerError,
        };
      }
      const reason: DomainReason =
        error.kind === "conflict" ? "provider_conflict" : "provider_error";
      return notYet(
        reason,
        { status: domain.providerRef ? "VERIFYING" : "PENDING", providerError },
        null,
      );
    }
    throw error;
  }
  const records = [own, ...provider.records];
  const ref = provider.ref ?? domain.providerRef;

  // 2. Storevia's ownership proof, then the provider's readiness.
  const owned = await ownershipProven(provisioner, domain.hostname, domain.verificationToken);
  if (!owned)
    return notYet(wasActive ? "dns_lost" : "dns_txt_missing", { providerRef: ref }, records);
  if (!provider.verified || !provider.configured) {
    return notYet(wasActive ? "dns_lost" : "dns_routing_missing", { providerRef: ref }, records);
  }
  if (provider.certificate !== "ready") {
    return notYet("certificate_pending", { providerRef: ref }, records);
  }
  return {
    status: "ACTIVE",
    providerRef: ref,
    failureReason: null,
    checkAttempts: 0,
    dnsRecords: records,
    becameActive: !wasActive,
    providerError: null,
  };
}
