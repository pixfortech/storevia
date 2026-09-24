"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { dashboardAuth, getSession } from "@/lib/auth";

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
