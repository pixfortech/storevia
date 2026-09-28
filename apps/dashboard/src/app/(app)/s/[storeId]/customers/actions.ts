"use server";

import { eraseCustomer, updateCustomer } from "@storevia/commerce";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { customersPath } from "@/lib/orders";
import { storeActionContext } from "@/lib/store-action";

// Customer actions: only the merchant's own note and tags are editable;
// contact details come from orders (ADR-0031 §6).

export async function saveCustomerAction(
  storeId: string,
  customerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await updateCustomer(ctx, customerId, {
      note: formData.get("note") ?? "",
      tags: formData.get("tags") ?? "",
    });
    revalidatePath(customersPath(ctx.storeId), "layout");
    return { ok: true, message: "Customer saved." };
  }, formData);
}

/**
 * Erases the customer's personal data (M8): typed confirmation here, then
 * customer.manage and a recent password in the service. Orders keep their
 * amounts; the customer leaves the list.
 */
export async function eraseCustomerAction(
  storeId: string,
  customerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await runAction(async () => {
    const confirm = formData.get("confirm");
    if (typeof confirm !== "string" || confirm.trim() !== "ERASE") {
      return { ok: false, fieldErrors: { confirm: "Type ERASE to confirm." } };
    }
    const ctx = await storeActionContext(storeId);
    await eraseCustomer(ctx, customerId);
    revalidatePath(customersPath(ctx.storeId), "layout");
    return { ok: true };
  }, formData);
  if (result.ok) redirect(`${customersPath(storeId)}?erased=1`);
  return result;
}
