"use server";

import {
  cancelOrder,
  completeOrder,
  deleteDemoOrder,
  fulfilOrder,
  refundOrder,
  replyToOrderMessage,
  resolvePendingRefund,
  resetCustomerOrderLink,
  setOrderArchived,
  SHIPMENT_LABELS,
  updateFulfilment,
  updateOrderNote,
  type RefundOutcome,
  type ShipmentStatus,
} from "@storevia/commerce";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { customersPath, ordersPath } from "@/lib/orders";
import { inventoryPath } from "@/lib/catalogue";
import { storeActionContext } from "@/lib/store-action";

// Order actions: the commerce order services do the work (row locks,
// quantity bounds, refund bounds, permissions, timeline and audit). The
// store id is re-verified against the session on every call.

function refresh(storeId: string) {
  revalidatePath(ordersPath(storeId), "layout");
  revalidatePath(customersPath(storeId), "layout");
  // Fulfilment, cancellation and restocks move stock.
  revalidatePath(inventoryPath(storeId), "layout");
}

/** A refund's outcome in words; a failed refund is reported as a failure. */
function refundState(outcome: RefundOutcome, prefix = ""): ActionState {
  if (outcome.status === "SUCCEEDED") return { ok: true, message: `${prefix}Refund issued.` };
  if (outcome.status === "PENDING") {
    return {
      ok: true,
      message:
        `${prefix}Refund requested. ` +
        (outcome.message ?? "It will show as refunded once the payment provider confirms it."),
    };
  }
  return {
    ok: false,
    message: `${prefix}The refund failed: ${outcome.message ?? "the payment provider declined it."}`,
  };
}

export async function fulfilOrderAction(
  storeId: string,
  orderId: string,
  input: {
    lines: readonly { lineId: string; quantity: string }[];
    trackingCompany: string;
    trackingNumber: string;
    trackingUrl: string;
    method?: string;
    status?: string;
  },
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const lines = input.lines.filter((l) => l.quantity.trim() !== "" && l.quantity.trim() !== "0");
    if (lines.length === 0) {
      return {
        ok: false,
        message: "Choose at least one item to fulfil.",
        fieldErrors: { lines: "Choose at least one item to fulfil." },
      };
    }
    await fulfilOrder(ctx, orderId, {
      lines: lines.map((l) => ({ lineId: l.lineId, quantity: l.quantity.trim() })),
      trackingCompany: input.trackingCompany,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
      ...(input.method ? { method: input.method } : {}),
      ...(input.status ? { status: input.status } : {}),
    });
    refresh(ctx.storeId);
    return { ok: true, message: "Items marked as fulfilled." };
  });
}

export async function cancelOrderAction(
  storeId: string,
  orderId: string,
  input: { reason: string; refund: boolean },
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result = await cancelOrder(ctx, orderId, { reason: input.reason, refund: input.refund });
    refresh(ctx.storeId);
    if (result.refund) return refundState(result.refund, "Order cancelled. ");
    return {
      ok: true,
      message: result.cancelled ? "Order cancelled." : "Order already cancelled.",
    };
  });
}

export async function refundOrderAction(
  storeId: string,
  orderId: string,
  input: {
    amount: string;
    reason: string;
    paymentId: string;
    locationId: string;
    lines: readonly { lineId: string; quantity: string; restock: boolean }[];
  },
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const lines = input.lines
      .filter((l) => l.quantity.trim() !== "" && l.quantity.trim() !== "0")
      .map((l) => ({ lineId: l.lineId, quantity: l.quantity.trim(), restock: l.restock }));
    const outcome = await refundOrder(ctx, orderId, {
      amount: input.amount.trim(),
      reason: input.reason,
      lines,
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
      ...(lines.some((l) => l.restock) && input.locationId ? { locationId: input.locationId } : {}),
    });
    refresh(ctx.storeId);
    return refundState(outcome);
  });
}

export async function resolveRefundAction(
  storeId: string,
  orderId: string,
  refundId: string,
  outcome: "succeeded" | "failed",
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result = await resolvePendingRefund(
      ctx,
      orderId,
      refundId,
      outcome === "succeeded" ? "succeeded" : "failed",
    );
    refresh(ctx.storeId);
    return {
      ok: true,
      message:
        result.status === "SUCCEEDED"
          ? "Refund marked as refunded."
          : result.status === "FAILED"
            ? "Refund marked as failed."
            : "The refund is still pending.",
    };
  });
}

export async function saveOrderNoteAction(
  storeId: string,
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await updateOrderNote(ctx, orderId, { note: formData.get("note") ?? "" });
    refresh(ctx.storeId);
    return { ok: true, message: "Note saved." };
  }, formData);
}

export async function archiveOrderAction(
  storeId: string,
  orderId: string,
  archived: boolean,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await setOrderArchived(ctx, orderId, archived);
    refresh(ctx.storeId);
    return {
      ok: true,
      message: archived
        ? "Order archived. Find it under Archived orders."
        : "Order restored from the archive.",
    };
  });
}

/** Revokes the customer's order links and emails a new one (M8, S4). */
export async function resetCustomerLinkAction(
  storeId: string,
  orderId: string,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { emailed } = await resetCustomerOrderLink(ctx, orderId);
    refresh(ctx.storeId);
    return {
      ok: true,
      message: emailed
        ? "Link reset. The old link no longer works, and the customer has been emailed a new one."
        : "Link reset. The old link no longer works. This order has no email address to send a new one to.",
    };
  });
}

/** Development and test data only: the service and the database both refuse otherwise. */
export async function deleteDemoOrderAction(
  storeId: string,
  orderId: string,
  input: { confirm: string },
): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await deleteDemoOrder(ctx, orderId, { confirm: input.confirm.trim() });
    refresh(ctx.storeId);
    return { ok: true, message: "Demo order deleted." };
  });
  if (result.ok) redirect(ordersPath(storeId));
  return result;
}

export async function updateFulfilmentAction(
  storeId: string,
  orderId: string,
  fulfilmentId: string,
  input: {
    method?: string;
    status?: string;
    trackingCompany?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    shippedAt?: string;
    deliveredAt?: string;
  },
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await updateFulfilment(ctx, orderId, fulfilmentId, input);
    refresh(ctx.storeId);
    return {
      ok: true,
      message: input.status
        ? `Marked as ${SHIPMENT_LABELS[input.status as ShipmentStatus].toLowerCase()}.`
        : "Fulfilment updated.",
    };
  });
}

export async function completeOrderAction(
  storeId: string,
  orderId: string,
  input: { override: boolean; reason: string },
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await completeOrder(ctx, orderId, input);
    refresh(ctx.storeId);
    return { ok: true, message: "Order complete." };
  });
}

export async function replyToMessageAction(
  storeId: string,
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await replyToOrderMessage(ctx, orderId, { body: formData.get("body") ?? "" });
    refresh(ctx.storeId);
    return { ok: true, message: "Reply sent. The customer gets it by email." };
  }, formData);
}
