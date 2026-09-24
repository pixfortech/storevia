import "server-only";
import { storefrontRootDomain } from "@storevia/tenancy";

export function storefrontDomainLabel(): string {
  return storefrontRootDomain();
}
