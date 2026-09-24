import { listMyOrganisations, listStores, requireOrganisationAccess } from "@storevia/tenancy";
import { toTypeId } from "@storevia/types";
import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { orgPath, storePath } from "@/lib/ids";

/** Entry point: send the user to the most useful place for them. */
export default async function HomeRedirect() {
  const principal = await requirePrincipal();
  const organisations = await listMyOrganisations(principal);
  const first = organisations[0];
  if (!first) redirect("/onboarding");
  const ctx = await requireOrganisationAccess(principal, toTypeId("organisation", first.id));
  const stores = await listStores(ctx);
  const store = stores[0];
  if (store) redirect(storePath(store.id));
  redirect(orgPath(first.id));
}
