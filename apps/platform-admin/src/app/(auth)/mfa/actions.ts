"use server";

import { safeRedirectPath } from "@storevia/security";
import { unauthenticated } from "@storevia/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { getSession, platformAuth } from "@/lib/auth";

export interface EnrolState extends ActionState {
  readonly recoveryCodes?: readonly string[] | undefined;
}

const code = (formData: FormData) => {
  const value = formData.get("code");
  return typeof value === "string" ? value.trim() : "";
};

/** Confirms the authenticator with its first code; returns the recovery codes (shown once). */
export async function completeEnrolmentAction(
  _prev: EnrolState,
  formData: FormData,
): Promise<EnrolState> {
  let codes: readonly string[] | undefined;
  const state = await runAction(async () => {
    const session = await getSession();
    if (!session) throw unauthenticated();
    const result = await platformAuth().completeMfaEnrolment(
      session,
      code(formData),
      await headers(),
    );
    if (!result.ok) {
      return { ok: false, message: result.message, fieldErrors: { code: result.message } };
    }
    codes = result.value.recoveryCodes;
    return { ok: true, message: "Two-step verification is on." };
  });
  return codes ? { ...state, recoveryCodes: codes } : state;
}

/** This sign-in's second factor; on success, on to where the staff member was going. */
export async function verifyMfaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw unauthenticated();
    const result = await platformAuth().verifyMfa(session, code(formData), await headers());
    if (!result.ok) {
      return { ok: false, message: result.message, fieldErrors: { code: result.message } };
    }
    const next = formData.get("next");
    redirect(safeRedirectPath(typeof next === "string" ? next : "", "/organisations"));
  }, formData);
}
