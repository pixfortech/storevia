"use server";

import {
  changeMemberRole,
  createInvitation,
  removeMember,
  requireOrganisationAccess,
  revokeInvitation,
  setMemberStatus,
  transferOwnership,
} from "@storevia/tenancy";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { requireActionPrincipal } from "@/lib/auth";
import { env } from "@/lib/env";
import { requestInfo } from "@/lib/request";

// Every action re-resolves the organisation context from the session: the
// orgId/membershipId/invitationId values come from the client and are only
// requests (docs 03 §3).

async function context(orgId: string) {
  return requireOrganisationAccess(await requireActionPrincipal(), orgId, await requestInfo());
}

function done(orgId: string, message: string): ActionState {
  revalidatePath(`/o/${orgId}/members`);
  return { ok: true, message };
}

export async function inviteMemberAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await context(orgId);
    await createInvitation(
      ctx,
      { email: formData.get("email"), role: formData.get("role") },
      (token) => `${env().DASHBOARD_URL}/invitations/${token}`,
    );
    return done(orgId, "Invitation sent.");
  }, formData);
}

export async function changeRoleAction(
  orgId: string,
  membershipId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await changeMemberRole(await context(orgId), membershipId, { role: formData.get("role") });
    return done(orgId, "Role updated.");
  });
}

export async function setMemberStatusAction(
  orgId: string,
  membershipId: string,
  status: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    await setMemberStatus(await context(orgId), membershipId, { status });
    return done(orgId, status === "SUSPENDED" ? "Member suspended." : "Member reactivated.");
  });
}

export async function removeMemberAction(
  orgId: string,
  membershipId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    await removeMember(await context(orgId), membershipId);
    // The row disappears, so confirm on the page itself.
    redirect(`/o/${orgId}/members?removed=1`);
  });
}

export async function revokeInvitationAction(
  orgId: string,
  invitationId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    await revokeInvitation(await context(orgId), invitationId);
    return done(orgId, "Invitation revoked.");
  });
}

export async function transferOwnershipAction(
  orgId: string,
  membershipId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    await transferOwnership(await context(orgId), membershipId);
    return done(orgId, "Ownership transferred.");
  });
}
