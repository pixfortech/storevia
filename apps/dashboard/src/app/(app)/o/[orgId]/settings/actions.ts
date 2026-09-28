"use server";

import {
  leaveOrganisation,
  renameOrganisation,
  requestOrganisationDeletion,
  requireOrganisationAccess,
} from "@storevia/tenancy";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { requireActionPrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

export async function renameOrganisationAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOrganisationAccess(
      await requireActionPrincipal(),
      orgId,
      await requestInfo(),
    );
    await renameOrganisation(ctx, { name: formData.get("name") });
    revalidatePath(`/o/${orgId}`, "layout");
    return { ok: true, message: "Organisation updated." };
  }, formData);
}

export async function leaveOrganisationAction(
  orgId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireOrganisationAccess(
      await requireActionPrincipal(),
      orgId,
      await requestInfo(),
    );
    await leaveOrganisation(ctx);
    redirect("/");
  });
}

/**
 * Asks for the organisation to be deleted (M8): owner, recent password and
 * the name typed out. The organisation closes at once; the owner can cancel
 * from their account page during the cooling-off period.
 */
export async function requestDeletionAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireOrganisationAccess(
      await requireActionPrincipal(),
      orgId,
      await requestInfo(),
    );
    await requestOrganisationDeletion(ctx, { confirmName: formData.get("confirmName") });
    return { ok: true };
  }, formData);
  if (result.ok) redirect("/account/security?deletion=requested#deletions");
  return result;
}
