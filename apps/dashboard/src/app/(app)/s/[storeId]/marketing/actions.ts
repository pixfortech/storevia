"use server";

import {
  createDiscount,
  deleteDiscount,
  setDiscountActive,
  updateDiscount,
} from "@storevia/commerce";
import { getStore } from "@storevia/tenancy";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { zonedLocalToDate } from "@/lib/discounts";
import { storePath } from "@/lib/ids";
import { storeActionContext } from "@/lib/store-action";

// Discount codes (ADR-0031 §7). The commerce service checks
// `discount.manage` (and the plan's `discounts` feature to create one) and
// validates every field; a used code can only be disabled.

const refresh = (storeId: string) => {
  revalidatePath(storePath(storeId, "/marketing"));
};

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * The form's date fields are wall-clock times in the store's time zone; the
 * service takes instants. A value that doesn't parse is passed through, so
 * the service reports it on its field.
 */
const instant = (value: string, timeZone: string) =>
  value.trim() ? (zonedLocalToDate(value, timeZone)?.toISOString() ?? value) : "";

export async function saveDiscountAction(
  storeId: string,
  discountId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { timezone } = await getStore(ctx);
    const input = {
      code: text(formData, "code"),
      title: text(formData, "title"),
      type: text(formData, "type"),
      value: text(formData, "value"),
      minSubtotal: text(formData, "minSubtotal"),
      startsAt: instant(text(formData, "startsAt"), timezone),
      endsAt: instant(text(formData, "endsAt"), timezone),
      usageLimit: text(formData, "usageLimit"),
    };
    if (discountId) await updateDiscount(ctx, discountId, input);
    else await createDiscount(ctx, input);
    refresh(ctx.storeId);
    return { ok: true, message: discountId ? "Discount code saved." : "Discount code created." };
  }, formData);
}

export async function setDiscountActiveAction(
  storeId: string,
  discountId: string,
  active: boolean,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await setDiscountActive(ctx, discountId, active);
    refresh(ctx.storeId);
    return { ok: true, message: active ? "Code enabled." : "Code disabled." };
  });
}

export async function deleteDiscountAction(
  storeId: string,
  discountId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await deleteDiscount(ctx, discountId);
    refresh(ctx.storeId);
    return { ok: true, message: "Discount code deleted." };
  });
}
