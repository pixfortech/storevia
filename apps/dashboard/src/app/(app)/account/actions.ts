"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelOrganisationDeletion } from "@storevia/tenancy";
import { emailSchema } from "@storevia/validation";
import { formValues, runAction, type ActionState } from "@/lib/action";
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

// --- Profile (DB-4) ----------------------------------------------------------

/** Renames the signed-in user; the shell shows the new name on every page. */
export async function updateNameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const result = await dashboardAuth().updateName(
      await session(),
      formData.get("name"),
      await headers(),
    );
    if (!result.ok) {
      const values = formValues(formData);
      return result.code === "INVALID_INPUT"
        ? { ok: false, fieldErrors: { name: result.message }, values }
        : { ok: false, message: result.message, values };
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Name saved.", values: { name: result.value.name } };
  }, formData);
}

/**
 * Starts an email change: the password is confirmed first (the step-up that
 * stamps this session), then a link goes to the new address. The account's
 * email stays as it is until that link is used.
 */
export async function requestEmailChangeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const values = formValues(formData);
    // Field problems first, so a typo never spends a password attempt.
    const email = emailSchema.safeParse(formData.get("newEmail") ?? "");
    const password = formData.get("password");
    const fieldErrors: Record<string, string> = {};
    if (!email.success) fieldErrors["newEmail"] = "Enter a valid email address.";
    if (typeof password !== "string" || !password) fieldErrors["password"] = "Enter your password.";
    if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

    const auth = dashboardAuth();
    const requestHeaders = await headers();
    const confirmed = await auth.confirmPassword(await session(), password, requestHeaders);
    if (!confirmed.ok) {
      return confirmed.code === "INVALID_CREDENTIALS"
        ? { ok: false, fieldErrors: { password: confirmed.message }, values }
        : { ok: false, message: confirmed.message, values };
    }
    // Read the session again: the confirmation just stamped it.
    const current = await auth.getSession(requestHeaders);
    if (!current) redirect("/sign-in");
    const result = await auth.requestEmailChange(current, formData.get("newEmail"), requestHeaders);
    if (!result.ok) {
      return result.code === "INVALID_INPUT"
        ? { ok: false, fieldErrors: { newEmail: result.message }, values }
        : { ok: false, code: result.code, message: result.message, values };
    }
    revalidatePath("/account/profile");
    return {
      ok: true,
      message: `We sent a link to ${result.value.email}. Your email stays ${current.email} until you confirm.`,
    };
  }, formData);
}

/** Withdraws a pending email change; its link stops working. */
export async function cancelEmailChangeAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    await dashboardAuth().cancelEmailChange(await session(), await headers());
    revalidatePath("/account/profile");
    return { ok: true, message: "Email change cancelled. Your email address hasn't changed." };
  });
}
