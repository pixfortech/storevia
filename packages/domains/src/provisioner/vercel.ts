import { resolveTxt } from "node:dns/promises";
import {
  ProvisionerError,
  type DnsRecord,
  type DomainProvisioner,
  type ProviderDomainStatus,
} from "./types";

// Vercel as the first production hosting provider (ADR-0032 §2). Storevia's
// one storefront project on Vercel serves every custom domain; merchants
// never need a Vercel account. The token lives in the server environment
// (secret manager in production), is sent only in the Authorization header
// to the Vercel API and is never logged or returned. Responses are reduced
// to ProviderDomainStatus here: nothing of the provider's payload leaves
// this file.
//
//   add       POST   /v10/projects/{project}/domains            { name }
//   status    GET    /v9/projects/{project}/domains/{domain}     (registration, verification)
//             GET    /v6/domains/{domain}/config                 (DNS configuration, recommended records)
//   verify    POST   /v9/projects/{project}/domains/{domain}/verify
//   remove    DELETE /v9/projects/{project}/domains/{domain}
//
// Certificates: Vercel issues and renews them itself once the domain is
// verified and configured; there is no per-domain certificate state worth
// mirroring, so "ready" means verified and configured.

export interface VercelConfig {
  readonly token: string;
  readonly projectId: string;
  readonly teamId?: string | undefined;
  /** Tests point this at a fake; production leaves the default. */
  readonly baseUrl?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly resolveTxt?: ((name: string) => Promise<string[][]>) | undefined;
}

// Vercel's documented defaults, used only when the config endpoint doesn't
// return project-specific recommendations.
const DEFAULT_A = "76.76.21.21";
const DEFAULT_CNAME = "cname.vercel-dns.com";

interface DomainBody {
  readonly name?: unknown;
  readonly verified?: unknown;
  readonly verification?: unknown;
}

interface ConfigBody {
  readonly misconfigured?: unknown;
  readonly recommendedIPv4?: unknown;
  readonly recommendedCNAME?: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export class VercelProvisioner implements DomainProvisioner {
  readonly key = "vercel" as const;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;
  private readonly txt: (name: string) => Promise<string[][]>;

  constructor(private readonly config: VercelConfig) {
    if (!config.token || !config.projectId) {
      throw new Error("Vercel provisioner needs VERCEL_API_TOKEN and VERCEL_PROJECT_ID");
    }
    this.base = (config.baseUrl ?? "https://api.vercel.com").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.doFetch = config.fetch ?? fetch;
    this.txt = config.resolveTxt ?? resolveTxt;
  }

  private url(path: string): string {
    const team = this.config.teamId ? `?teamId=${encodeURIComponent(this.config.teamId)}` : "";
    return `${this.base}${path}${team}`;
  }

  private projectDomain(hostname: string, suffix = ""): string {
    return this.url(
      `/v9/projects/${encodeURIComponent(this.config.projectId)}/domains/${encodeURIComponent(hostname)}${suffix}`,
    );
  }

  /** One API call: status and parsed JSON (null body for 204/empty). Network failures are typed. */
  private async call(
    url: string,
    init: { method: string; body?: unknown },
  ): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try {
      response = await this.doFetch(url, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ProvisionerError("timeout", `Vercel ${init.method} timed out`);
      }
      throw new ProvisionerError("unavailable", `Vercel ${init.method} failed to connect`);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ProvisionerError(
        "unavailable",
        `Vercel ${init.method} returned ${String(response.status)}`,
      );
    }
    const text = await response.text().catch(() => "");
    if (!text) return { status: response.status, body: null };
    try {
      return { status: response.status, body: JSON.parse(text) as unknown };
    } catch {
      throw new ProvisionerError("invalid", `Vercel ${init.method} returned malformed JSON`);
    }
  }

  private unexpected(method: string, status: number): ProvisionerError {
    return new ProvisionerError("invalid", `Vercel ${method} returned ${String(status)}`);
  }

  private parseDomain(body: unknown, hostname: string): DomainBody {
    if (!isObject(body) || (body["name"] !== undefined && body["name"] !== hostname)) {
      throw new ProvisionerError("invalid", "Vercel returned an unexpected domain");
    }
    return body;
  }

  /** The domain on our project, or null when it isn't there. */
  private async projectDomainBody(hostname: string): Promise<DomainBody | null> {
    const { status, body } = await this.call(this.projectDomain(hostname), { method: "GET" });
    if (status === 404) return null;
    if (status !== 200) throw this.unexpected("GET", status);
    return this.parseDomain(body, hostname);
  }

  private async dnsConfig(hostname: string): Promise<ConfigBody> {
    const { status, body } = await this.call(
      this.url(`/v6/domains/${encodeURIComponent(hostname)}/config`),
      { method: "GET" },
    );
    if (status !== 200 || !isObject(body)) throw this.unexpected("GET config", status);
    return body;
  }

  private routing(hostname: string, config: ConfigBody): DnsRecord {
    const isApex = hostname.split(".").length === 2;
    if (isApex) {
      const ipv4 = Array.isArray(config.recommendedIPv4) ? config.recommendedIPv4 : [];
      const first = ipv4.find(isObject);
      const values = first && Array.isArray(first["value"]) ? first["value"] : [];
      const value = values.find((v): v is string => typeof v === "string") ?? DEFAULT_A;
      return { type: "A", name: hostname, value, purpose: "routing" };
    }
    const cnames = Array.isArray(config.recommendedCNAME) ? config.recommendedCNAME : [];
    const first = cnames.find(isObject);
    const value =
      first && typeof first["value"] === "string"
        ? first["value"].replace(/\.$/, "")
        : DEFAULT_CNAME;
    return { type: "CNAME", name: hostname, value, purpose: "routing" };
  }

  private verificationRecords(body: DomainBody): DnsRecord[] {
    const list = Array.isArray(body.verification) ? body.verification : [];
    return list.filter(isObject).flatMap((v) =>
      v["type"] === "TXT" && typeof v["domain"] === "string" && typeof v["value"] === "string"
        ? [
            {
              type: "TXT" as const,
              name: v["domain"],
              value: v["value"],
              purpose: "provider-verification" as const,
            },
          ]
        : [],
    );
  }

  private async describe(hostname: string, body: DomainBody | null): Promise<ProviderDomainStatus> {
    if (!body) {
      return {
        registered: false,
        ref: null,
        verified: false,
        configured: false,
        certificate: "pending",
        records: [],
      };
    }
    const config = await this.dnsConfig(hostname);
    const verified = body.verified === true;
    const configured = config.misconfigured === false;
    return {
      registered: true,
      ref: `vercel:${this.config.projectId}:${hostname}`,
      verified,
      configured,
      certificate: verified && configured ? "ready" : "pending",
      records: [this.routing(hostname, config), ...this.verificationRecords(body)],
    };
  }

  async addDomain(hostname: string): Promise<ProviderDomainStatus> {
    const { status, body } = await this.call(
      this.url(`/v10/projects/${encodeURIComponent(this.config.projectId)}/domains`),
      { method: "POST", body: { name: hostname } },
    );
    if (status === 200 || status === 201) {
      return this.describe(hostname, this.parseDomain(body, hostname));
    }
    if (status === 409 || status === 400) {
      // Already on our project (a retry): success. Anywhere else: a conflict.
      const ours = await this.projectDomainBody(hostname);
      if (ours) return this.describe(hostname, ours);
      throw new ProvisionerError("conflict", "domain is in use by another provider project");
    }
    throw this.unexpected("POST", status);
  }

  async removeDomain(hostname: string): Promise<void> {
    const { status } = await this.call(this.projectDomain(hostname), { method: "DELETE" });
    if (status === 200 || status === 204 || status === 404) return;
    throw this.unexpected("DELETE", status);
  }

  async getDomainStatus(hostname: string): Promise<ProviderDomainStatus> {
    return this.describe(hostname, await this.projectDomainBody(hostname));
  }

  async verifyDomain(hostname: string): Promise<ProviderDomainStatus> {
    const { status, body } = await this.call(this.projectDomain(hostname, "/verify"), {
      method: "POST",
    });
    if (status === 200) return this.describe(hostname, this.parseDomain(body, hostname));
    // Not verifiable yet (e.g. its TXT challenge isn't published): report the current state.
    if (status === 400 || status === 404 || status === 409) return this.getDomainStatus(hostname);
    throw this.unexpected("POST verify", status);
  }

  async lookupTxt(name: string): Promise<readonly string[]> {
    try {
      return (await this.txt(name)).map((chunks) => chunks.join(""));
    } catch {
      // NXDOMAIN / no data / resolver trouble: "not found yet", checked again later.
      return [];
    }
  }
}
