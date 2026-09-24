"use server";

import {
  leaveOrganisation,
  renameOrganisation,
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
