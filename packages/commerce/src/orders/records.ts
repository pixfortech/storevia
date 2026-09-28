import type { TenantTx } from "@storevia/database";
import { uuidv7 } from "@storevia/types";

// The records every order change writes in its own transaction (ADR-0031
// §5, §12): a timeline event and, when the shopper should hear about it, a
// notification for the worker to send. Shared by the checkout role (order
// creation) and the merchant role (fulfilment, cancellation, refunds).
// Integration events (§11) come from database triggers on Order and Refund,
// so no role needs to write the outbox.

export interface OrderScope {
  readonly organisationId: string;
  readonly storeId: string;
}

export async function orderEvent(
  tx: TenantTx,
  scope: OrderScope,
  orderId: string,
  type: string,
  message: string,
  data: Record<string, unknown> | null = null,
  actorUserId: string | null = null,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "OrderEvent" (id, "organisationId", "storeId", "orderId", type, message, data,
      "actorUserId")
    VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
      ${orderId}::uuid, ${type}, ${message}, ${data ? JSON.stringify(data) : null}::jsonb,
      ${actorUserId}::uuid)`;
}

export type NotificationKind =
  | "ORDER_CONFIRMATION"
  | "ORDER_CANCELLED"
  | "ORDER_FULFILLED"
  | "REFUND_CREATED"
  | "ORDER_MESSAGE_REPLY";

/**
 * Queues an email to the order's address. `dedupeKey` makes a repeated
 * write a no-op, so a retried change never sends twice.
 */
export async function queueNotification(
  tx: TenantTx,
  scope: OrderScope,
  orderId: string,
  kind: NotificationKind,
  dedupeKey: string,
  recipient: string | null,
  referenceId: string | null = null,
): Promise<void> {
  if (!recipient) return;
  await tx.$executeRaw`
    INSERT INTO "OrderNotification" (id, "organisationId", "storeId", "orderId", kind, "dedupeKey",
      recipient, "referenceId", "updatedAt")
    VALUES (${uuidv7()}::uuid, ${scope.organisationId}::uuid, ${scope.storeId}::uuid,
      ${orderId}::uuid, ${kind}::"NotificationKind", ${dedupeKey}, ${recipient},
      ${referenceId}::uuid, now())
    ON CONFLICT ("dedupeKey") DO NOTHING`;
}
