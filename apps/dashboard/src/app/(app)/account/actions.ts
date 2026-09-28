"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelOrganisationDeletion } from "@storevia/tenancy";
import { runAction, type ActionState } from "@/lib/action";
import { dashboardAuth, getSession, requireActionPrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

export async function signOutAction(): Promise<void> {
  await dashboardAuth().signOut(await headers());
  redirect("/sign-in");
}

async function session() {
  const current = await getSession();
  if (!current) redirect("/sign-in");
  return current;
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const next = formData.get("newPassword");
    if (next !== formData.get("confirmPassword")) {
      return { ok: false, fieldErrors: { confirmPassword: "Passwords don't match." } };
    }
    const result = await dashboardAuth().changePassword(
      await session(),
      { currentPassword: formData.get("currentPassword"), newPassword: next },
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/account/security");
    return { ok: true, message: "Password changed. Your other sessions were signed out." };
  });
}

export async function confirmPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const result = await dashboardAuth().confirmPassword(
      await session(),
      formData.get("password"),
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message };
    return {
      ok: true,
      message: "Confirmed. For the next 10 minutes you can perform sensitive actions.",
    };
  });
}

export async function revokeSessionAction(
  sessionId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const revoked = await dashboardAuth().revokeSession(
      await session(),
      sessionId,
      await headers(),
    );
    revalidatePath("/account/security");
    return revoked
      ? { ok: true, message: "Session signed out." }
      : { ok: false, message: "That session no longer exists." };
  });
}

export async function revokeOtherSessionsAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const count = await dashboardAuth().revokeOtherSessions(await session(), await headers());
    revalidatePath("/account/security");
    return {
      ok: true,
      message: count
        ? `Signed out ${String(count)} other session${count === 1 ? "" : "s"}.`
        : "No other sessions.",
    };
  });
}

/** The owner changes their mind during the cooling-off period (M8). */
export async function cancelDeletionAction(
  orgId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const result = await runAction(async () => {
    await cancelOrganisationDeletion(await requireActionPrincipal(), orgId, await requestInfo());
    return { ok: true };
  });
  if (result.ok) redirect(`/o/${orgId}`);
  return result;
}

/** Deletes the signed-in user's own account (M8): password and email typed. */
export async function deleteAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await runAction(async () => {
    const outcome = await dashboardAuth().deleteAccount(
      await session(),
      { password: formData.get("password"), confirmEmail: formData.get("confirmEmail") },
      await headers(),
    );
    if (!outcome.ok) return { ok: false, message: outcome.message };
    return { ok: true };
  }, formData);
  if (result.ok) redirect("/sign-in?deleted=1");
  return result;
}
