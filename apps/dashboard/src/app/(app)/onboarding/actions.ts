"use server";

import { createOrganisation } from "@storevia/tenancy";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { requireActionPrincipal } from "@/lib/auth";
import { orgPath } from "@/lib/ids";
import { requestInfo } from "@/lib/request";

export async function createOrganisationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const principal = await requireActionPrincipal();
    const { organisationId } = await createOrganisation(
      principal,
      { name: formData.get("name"), country: formData.get("country") ?? "" },
      await requestInfo(),
    );
    redirect(orgPath(organisationId, "/stores/new?onboarding=1"));
  }, formData);
}
