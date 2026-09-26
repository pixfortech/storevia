"use server";

import {
  archiveStore,
  changeStoreBusinessType,
  changeStoreSlug,
  requireStoreAccess,
  setStorefrontLive,
  updateStore,
} from "@storevia/tenancy";
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

/** Presentation only (ADR-0024): navigation and suggestions change; data and access don't. */
export async function changeBusinessTypeAction(
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
    await changeStoreBusinessType(ctx, { businessType: formData.get("businessType") });
    revalidatePath(`/s/${storeId}`, "layout");
    return { ok: true, message: "Business type updated. Your navigation now reflects it." };
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

/** Takes the storefront live, or back to "coming soon" (ADR-0028 §3). */
export async function setStorefrontLiveAction(
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
    const live = formData.get("live") === "true";
    await setStorefrontLive(ctx, live);
    revalidatePath(`/s/${storeId}`, "layout");
    return {
      ok: true,
      message: live ? "Your store is live." : "Your store now shows a coming-soon page.",
    };
  }, formData);
}

/** Changes the store address; the old one keeps redirecting (ADR-0028 §12). */
export async function changeStoreSlugAction(
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
    const { hostname } = await changeStoreSlug(ctx, { slug: formData.get("slug") });
    revalidatePath(`/s/${storeId}`, "layout");
    return { ok: true, message: `Your store is now at ${hostname}.` };
  }, formData);
}
