import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ProvisionerError,
  type DnsRecord,
  type DomainProvisioner,
  type ProviderDomainStatus,
} from "./types";

// The local provider (ADR-0032 §2): development, CI and E2E. No network and
// no randomness: a small JSON file stands in for the world's DNS and for
// the provider project, so the dashboard, the worker and a test can all see
// the same simulated state.
//
//   domains.simulate(host, { txt, routed, certificate })  what "the merchant's DNS" says
//   first label provider-error / provider-timeout / provider-conflict  provider failures
//
// Routing values use documentation addresses (RFC 5737) and a `.test` name:
// they are the simulator's own instructions, never shown in production.

export interface SimulatedDns {
  /** Values published at `_storevia-verification.{host}`. */
  readonly txt?: readonly string[];
  /** The domain's A/CNAME points at the provider. */
  readonly routed?: boolean;
  /** Certificate state once routed (default "ready"). */
  readonly certificate?: "pending" | "ready";
}

interface State {
  registered: string[];
  dns: Record<string, SimulatedDns>;
}

export const LOCAL_ROUTING = { a: "192.0.2.10", cname: "stores.storevia.test" } as const;

export function localStatePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["DOMAIN_PROVIDER_LOCAL_STATE"];
  return configured !== undefined && configured !== ""
    ? configured
    : join(tmpdir(), "storevia-local-domains.json");
}

function read(path: string): State {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<State>;
    return { registered: parsed.registered ?? [], dns: parsed.dns ?? {} };
  } catch {
    return { registered: [], dns: {} };
  }
}

function write(path: string, state: State): void {
  mkdirSync(dirname(path), { recursive: true });
  // Write then rename: another process never reads half a file.
  const temp = `${path}.${String(process.pid)}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2));
  renameSync(temp, path);
}

/** Sets what the simulated DNS says about `hostname` (tests, E2E, `pnpm domains:simulate`). */
export function simulateDns(hostname: string, dns: SimulatedDns | null, path = localStatePath()) {
  const state = read(path);
  state.dns = Object.fromEntries(Object.entries(state.dns).filter(([h]) => h !== hostname));
  if (dns) state.dns[hostname] = dns;
  write(path, state);
}

/** The domain disappears from the provider project without Storevia asking (support case). */
export function simulateExternalRemoval(hostname: string, path = localStatePath()) {
  const state = read(path);
  state.registered = state.registered.filter((h) => h !== hostname);
  write(path, state);
}

/** Forgets every simulated domain (test isolation). */
export function resetLocalProvider(path = localStatePath()) {
  write(path, { registered: [], dns: {} });
}

function failureFor(hostname: string, operation: "add" | "status"): ProvisionerError | null {
  const label = hostname.split(".")[0] ?? "";
  if (label === "provider-error")
    return new ProvisionerError("unavailable", "provider returned 500");
  if (label === "provider-timeout") return new ProvisionerError("timeout", "provider timed out");
  if (label === "provider-conflict" && operation === "add") {
    return new ProvisionerError("conflict", "domain belongs to another provider account");
  }
  return null;
}

const apex = (hostname: string) => hostname.split(".").length === 2;

function routingRecord(hostname: string): DnsRecord {
  return apex(hostname)
    ? { type: "A", name: hostname, value: LOCAL_ROUTING.a, purpose: "routing" }
    : { type: "CNAME", name: hostname, value: LOCAL_ROUTING.cname, purpose: "routing" };
}

export class LocalProvisioner implements DomainProvisioner {
  readonly key = "local" as const;

  constructor(private readonly path: string = localStatePath()) {}

  defaultRoutingRecord(hostname: string): DnsRecord {
    return routingRecord(hostname);
  }

  private status(hostname: string): ProviderDomainStatus {
    const state = read(this.path);
    const registered = state.registered.includes(hostname);
    const dns: SimulatedDns | undefined = Object.hasOwn(state.dns, hostname)
      ? state.dns[hostname]
      : undefined;
    const configured = registered && dns?.routed === true;
    return {
      registered,
      ref: registered ? `local:${hostname}` : null,
      verified: registered,
      configured,
      certificate: configured && (dns.certificate ?? "ready") === "ready" ? "ready" : "pending",
      records: [routingRecord(hostname)],
    };
  }

  addDomain(hostname: string): Promise<ProviderDomainStatus> {
    const failure = failureFor(hostname, "add");
    if (failure) return Promise.reject(failure);
    const state = read(this.path);
    if (!state.registered.includes(hostname)) {
      state.registered.push(hostname);
      write(this.path, state);
    }
    return Promise.resolve(this.status(hostname));
  }

  removeDomain(hostname: string): Promise<void> {
    const failure = failureFor(hostname, "status");
    if (failure) return Promise.reject(failure);
    const state = read(this.path);
    state.registered = state.registered.filter((h) => h !== hostname);
    write(this.path, state);
    return Promise.resolve();
  }

  getDomainStatus(hostname: string): Promise<ProviderDomainStatus> {
    const failure = failureFor(hostname, "status");
    return failure ? Promise.reject(failure) : Promise.resolve(this.status(hostname));
  }

  verifyDomain(hostname: string): Promise<ProviderDomainStatus> {
    return this.getDomainStatus(hostname);
  }

  lookupTxt(name: string): Promise<readonly string[]> {
    const prefix = "_storevia-verification.";
    if (!name.startsWith(prefix)) return Promise.resolve([]);
    return Promise.resolve(read(this.path).dns[name.slice(prefix.length)]?.txt ?? []);
  }
}
