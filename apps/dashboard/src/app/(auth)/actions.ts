"use server";

import { safeRedirectPath } from "@storevia/security";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, formValues, type ActionState } from "@/lib/action";
import { dashboardAuth } from "@/lib/auth";

const str = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const result = await dashboardAuth().signIn(
      { email: str(formData, "email"), password: str(formData, "password") },
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message, values: formValues(formData) };
    redirect(safeRedirectPath(str(formData, "next"), "/"));
  }, formData);
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const result = await dashboardAuth().signUp(
      {
        name: str(formData, "name"),
        email: str(formData, "email"),
        password: str(formData, "password"),
      },
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message, values: formValues(formData) };
    const next = safeRedirectPath(str(formData, "next"), "");
    redirect(
      `/check-email?email=${encodeURIComponent(result.value.email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`,
    );
  }, formData);
}

export async function resendVerificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const result = await dashboardAuth().resendVerification(
      str(formData, "email"),
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, message: "If that address needs confirming, we've sent a new link." };
  });
}

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const result = await dashboardAuth().requestPasswordReset(
      str(formData, "email"),
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message, values: formValues(formData) };
    return {
      ok: true,
      message: "If an account exists for that email, we've sent a link to reset your password.",
    };
  }, formData);
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const password = str(formData, "password");
    if (password !== str(formData, "confirmPassword")) {
      return { ok: false, fieldErrors: { confirmPassword: "Passwords don't match." } };
    }
    const result = await dashboardAuth().resetPassword(
      str(formData, "token"),
      password,
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message };
    redirect("/sign-in?reset=1");
  });
}
