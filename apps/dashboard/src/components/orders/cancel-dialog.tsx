"use client";

import { Button } from "@storevia/ui/button";
import { Checkbox } from "@storevia/ui/choice";
import { Field, Textarea } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert } from "@storevia/ui/surfaces";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelOrderAction } from "@/app/(app)/s/[storeId]/orders/actions";
import type { FormState } from "@/components/forms";

/**
 * Cancels an order that has nothing fulfilled: reserved stock goes back on
 * sale and the customer is told. With refund rights, the payment can be
 * refunded in the same step.
 */
export function CancelOrderDialog({
  storeId,
  orderId,
  orderLabel,
  refundable,
}: {
  storeId: string;
  orderId: string;
  orderLabel: string;
  /** The amount a refund would return (formatted), when the member may refund and money was captured. */
  refundable: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(refundable !== null);
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setReason("");
          setRefund(refundable !== null);
          setState({ ok: false });
        }
        setOpen(next);
      }}
      trigger={<Button variant="danger-outline">Cancel order</Button>}
      title={`Cancel ${orderLabel}?`}
      description="Reserved stock goes back on sale and the customer is emailed. This can't be undone."
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await cancelOrderAction(storeId, orderId, {
              reason,
              refund: refundable !== null && refund,
            });
            setState(result);
            router.refresh();
            if (result.ok) setOpen(false);
          });
        }}
      >
        {!state.ok && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <Field
          label="Reason"
          optional
          description="Kept on the order's timeline."
          error={state.fieldErrors?.["reason"]}
        >
          <Textarea
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
          />
        </Field>
        {refundable !== null ? (
          <Checkbox
            label="Refund the payment"
            description={`Returns ${refundable} to the customer through the payment provider.`}
            checked={refund}
            onCheckedChange={(value) => {
              setRefund(value === true);
            }}
          />
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Keep order
            </Button>
          </DialogClose>
          <Button type="submit" variant="danger" pending={pending}>
            Cancel order
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
