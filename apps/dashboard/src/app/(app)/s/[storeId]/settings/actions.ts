"use server";

import { archiveStore, requireStoreAccess, updateStore } from "@storevia/tenancy";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { requireActionPrincipal } from "@/lib/auth";
import { orgPath } from "@/lib/ids";
import { requestInfo } from "@/lib/request";

/**
 * `storeId` is supplied by the client (bound argument). It is re-verified
 * against the session's memberships on every call: changing it in a crafted
 * request yields NOT_FOUND, never another tenant's store.
 */
export async function updateStoreAction(
  storeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStoreAccess(
      await requireActionPrincipal(),
      storeId,
      await requestInfo(),
    );
    await updateStore(ctx, {
      name: formData.get("name"),
      locale: formData.get("locale"),
      timezone: formData.get("timezone"),
      contactEmail: formData.get("contactEmail") ?? "",
      supportEmail: formData.get("supportEmail") ?? "",
    });
    revalidatePath(`/s/${storeId}`, "layout");
    return { ok: true, message: "Settings saved." };
  }, formData);
}

export async function archiveStoreAction(
  storeId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireStoreAccess(
      await requireActionPrincipal(),
      storeId,
      await requestInfo(),
    );
    await archiveStore(ctx);
    redirect(orgPath(ctx.organisationId));
  });
}
