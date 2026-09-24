"use server";

import { safeRedirectPath } from "@storevia/security";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formValues, runAction, type ActionState } from "@/lib/action";
import { platformAuth } from "@/lib/auth";

const str = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

/** Platform realm sign-in: only active PlatformStaff can obtain a session. */
export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const result = await platformAuth().signIn(
      { email: str(formData, "email"), password: str(formData, "password") },
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message, values: formValues(formData) };
    redirect(safeRedirectPath(str(formData, "next"), "/organisations"));
  }, formData);
}

export async function signOutAction(): Promise<void> {
  await platformAuth().signOut(await headers());
  redirect("/sign-in");
}
