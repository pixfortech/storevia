"use server";

import { headers } from "next/headers";
import { runAction, type ActionState } from "@/lib/action";
import { getSession, platformAuth } from "@/lib/auth";
import { unauthenticated } from "@storevia/types";

/** Step-up: re-confirming the password stamps the platform session for 10 minutes. */
export async function confirmPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw unauthenticated();
    const result = await platformAuth().confirmPassword(
      session,
      formData.get("password"),
      await headers(),
    );
    if (!result.ok) return { ok: false, message: result.message };
    return {
      ok: true,
      message: "Confirmed. For the next 10 minutes you can make billing changes.",
    };
  });
}
