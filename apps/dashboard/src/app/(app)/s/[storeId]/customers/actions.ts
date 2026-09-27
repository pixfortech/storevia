"use server";

import { updateCustomer } from "@storevia/commerce";
import { revalidatePath } from "next/cache";
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
