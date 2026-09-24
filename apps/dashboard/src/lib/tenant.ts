import "server-only";
import {
  requireOrganisationAccess,
  requireStoreAccess,
  type OrganisationContext,
  type StoreContext,
} from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { notFound, redirect } from "next/navigation";
import { requirePrincipal } from "./auth";
import { requestInfo } from "./request";

/**
 * Page-level context resolution. The route parameter is only a request: the
 * membership check decides. Foreign or malformed IDs render the 404 page.
 */
export async function storeContextOr404(
  storeParam: string,
  returnTo: string,
): Promise<StoreContext> {
  const principal = await requirePrincipal(returnTo);
  try {
    return await requireStoreAccess(principal, storeParam, await requestInfo());
  } catch (error) {
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    if (isDomainError(error)) notFound();
    throw error;
  }
}

export async function organisationContextOr404(
  orgParam: string,
  returnTo: string,
): Promise<OrganisationContext> {
  const principal = await requirePrincipal(returnTo);
  try {
    return await requireOrganisationAccess(principal, orgParam, await requestInfo());
  } catch (error) {
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    if (isDomainError(error)) notFound();
    throw error;
  }
}
