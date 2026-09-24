"use server";

import { createStore, requireOrganisationAccess } from "@storevia/tenancy";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { requireActionPrincipal } from "@/lib/auth";
import { storePath } from "@/lib/ids";
import { requestInfo } from "@/lib/request";

/**
 * `orgId` arrives from the client (bound argument) and is therefore only a
 * request: the membership check below decides whether it is allowed.
 */
export async function createStoreAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const principal = await requireActionPrincipal();
    const ctx = await requireOrganisationAccess(principal, orgId, await requestInfo());
    const { storeId } = await createStore(ctx, {
      name: formData.get("name"),
      slug: formData.get("slug"),
      currency: formData.get("currency"),
      country: formData.get("country"),
      locale: formData.get("locale"),
      timezone: formData.get("timezone"),
    });
    redirect(storePath(storeId, "?welcome=1"));
  }, formData);
}
