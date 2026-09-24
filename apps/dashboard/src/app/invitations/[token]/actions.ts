"use server";

import { acceptInvitation } from "@storevia/tenancy";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { requireActionPrincipal } from "@/lib/auth";
import { orgPath } from "@/lib/ids";
import { requestInfo } from "@/lib/request";

export async function acceptInvitationAction(
  token: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const { organisationId } = await acceptInvitation(
      await requireActionPrincipal(),
      token,
      await requestInfo(),
    );
    redirect(orgPath(organisationId));
  });
}
