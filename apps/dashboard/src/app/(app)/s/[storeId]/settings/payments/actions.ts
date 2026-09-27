"use server";

import {
  connectRazorpay,
  connectTestPayments,
  setPaymentConnectionActive,
} from "@storevia/commerce";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { settingsPath } from "@/lib/settings-tabs";
import { storeActionContext } from "@/lib/store-action";

// Payment provider connections (ADR-0031 §4). Credentials go straight to the
// commerce service, which seals them; they are never returned, logged or
// echoed back into the form.

const refresh = (storeId: string) => {
  revalidatePath(settingsPath(storeId, "/payments"));
};

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function connectTestPaymentsAction(
  storeId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await connectTestPayments(ctx);
    refresh(ctx.storeId);
    return { ok: true, message: "Test payments connected. No real money moves." };
  });
}

export async function connectRazorpayAction(
  storeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Only the non-secret fields may be echoed back after a failed submit.
  const echo = new FormData();
  echo.set("keyId", text(formData, "keyId"));
  echo.set("accountId", text(formData, "accountId"));
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await connectRazorpay(ctx, {
      keyId: text(formData, "keyId"),
      keySecret: text(formData, "keySecret"),
      webhookSecret: text(formData, "webhookSecret"),
      accountId: text(formData, "accountId"),
    });
    refresh(ctx.storeId);
    return {
      ok: true,
      message: "Razorpay connected. Now add the webhook in Razorpay (step 3).",
    };
  }, echo);
}

export async function setPaymentConnectionActiveAction(
  storeId: string,
  connectionId: string,
  active: boolean,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await setPaymentConnectionActive(ctx, connectionId, active);
    refresh(ctx.storeId);
    return { ok: true, message: active ? "Provider enabled." : "Provider disabled." };
  });
}
