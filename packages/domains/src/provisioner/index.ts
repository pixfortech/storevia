import "server-only";
import { LocalProvisioner } from "./local";
import type { DomainProvisioner } from "./types";
import { VercelProvisioner } from "./vercel";

// @storevia/domains/provisioner (ADR-0032 §2): the configured hosting
// provider. DOMAIN_HOSTING_PROVIDER=local (default outside production) or
// vercel (VERCEL_API_TOKEN, VERCEL_PROJECT_ID, optional VERCEL_TEAM_ID).
// The local simulator is refused in production; Vercel is refused without
// its credentials. Control plane only: never imported by the storefront.

export * from "./types";
export { LOCAL_ROUTING, simulateDns, simulateExternalRemoval, resetLocalProvider } from "./local";
export type { SimulatedDns } from "./local";
export { LocalProvisioner } from "./local";
export { VercelProvisioner } from "./vercel";
export { evaluateDomain, ownershipRecord } from "./evaluate";
export type { DomainOutcome, DomainSnapshot } from "./evaluate";

const nonEmpty = (value: string | undefined) => (value === "" ? undefined : value);

let cached: { readonly signature: string; readonly provisioner: DomainProvisioner } | undefined;

export function domainProvisionerKey(env: NodeJS.ProcessEnv = process.env): "local" | "vercel" {
  const configured = env["DOMAIN_HOSTING_PROVIDER"];
  if (configured === "vercel") return "vercel";
  if (configured === "local" || configured === undefined || configured === "") {
    if (env["STOREVIA_ENV"] === "production") {
      throw new Error("DOMAIN_HOSTING_PROVIDER must be vercel in production");
    }
    return "local";
  }
  throw new Error(`Unknown DOMAIN_HOSTING_PROVIDER "${configured}"`);
}

export function getDomainProvisioner(env: NodeJS.ProcessEnv = process.env): DomainProvisioner {
  const key = domainProvisionerKey(env);
  const signature = [
    key,
    env["VERCEL_PROJECT_ID"] ?? "",
    env["VERCEL_TEAM_ID"] ?? "",
    env["VERCEL_API_URL"] ?? "",
    env["DOMAIN_PROVIDER_LOCAL_STATE"] ?? "",
  ].join("|");
  if (cached?.signature === signature) return cached.provisioner;
  const provisioner: DomainProvisioner =
    key === "vercel"
      ? new VercelProvisioner({
          token: env["VERCEL_API_TOKEN"] ?? "",
          projectId: env["VERCEL_PROJECT_ID"] ?? "",
          teamId: nonEmpty(env["VERCEL_TEAM_ID"]),
          baseUrl: nonEmpty(env["VERCEL_API_URL"]),
        })
      : new LocalProvisioner();
  cached = { signature, provisioner };
  return provisioner;
}
