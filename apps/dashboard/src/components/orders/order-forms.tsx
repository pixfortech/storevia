"use client";

import { Button } from "@storevia/ui/button";
import { Field, Textarea } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert } from "@storevia/ui/surfaces";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { resolveRefundAction, saveOrderNoteAction } from "@/app/(app)/s/[storeId]/orders/actions";
import { FormMessage, SubmitButton, type FormState } from "@/components/forms";

/** The staff-only note on an order (never shown to the customer). */
export function OrderNoteForm({
  storeId,
  orderId,
  note,
}: {
  storeId: string;
  orderId: string;
  note: string;
}) {
  const [state, action] = useActionState(saveOrderNoteAction.bind(null, storeId, orderId), {
    ok: false,
  });
  return (
    <form action={action} className="space-y-3">
      <Field
        label="Note"
        hideLabel
        description="Only your team sees this."
        error={state.fieldErrors?.["note"]}
      >
        <Textarea
          name="note"
          rows={3}
          maxLength={5000}
          defaultValue={state.values?.["note"] ?? note}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <FormMessage state={state} variant="inline" className="mr-auto" />
        <SubmitButton size="sm" variant="secondary">
          Save note
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * For a refund the provider didn't confirm: after checking the provider's
 * dashboard, staff record what happened. Each choice asks for confirmation.
 */
export function ResolveRefundButtons({
  storeId,
  orderId,
  refundId,
  amount,
}: {
  storeId: string;
  orderId: string;
  refundId: string;
  /** Formatted refund amount. */
  amount: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ResolveDialog
        storeId={storeId}
        orderId={orderId}
        refundId={refundId}
        outcome="succeeded"
        title={`Mark ${amount} as refunded?`}
        description="Do this only once your payment provider's dashboard shows the refund as processed. The order's refunded total is updated."
        label="Mark as refunded"
      />
      <ResolveDialog
        storeId={storeId}
        orderId={orderId}
        refundId={refundId}
        outcome="failed"
        title={`Mark ${amount} as failed?`}
        description="Do this only if your payment provider shows the refund didn't go through. The amount can then be refunded again."
        label="Mark as failed"
      />
    </div>
  );
}

function ResolveDialog({
  storeId,
  orderId,
  refundId,
  outcome,
  title,
  description,
  label,
}: {
  storeId: string;
  orderId: string;
  refundId: string;
  outcome: "succeeded" | "failed";
  title: string;
  description: string;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      open={open}
      onOpenChange={(next) => {
        if (next) setState({ ok: false });
        setOpen(next);
      }}
      trigger={
        <Button size="sm" variant={outcome === "succeeded" ? "secondary" : "ghost"}>
          {label}
        </Button>
      }
      title={title}
      description={description}
    >
      <div className="space-y-5">
        {!state.ok && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={outcome === "failed" ? "danger" : "primary"}
            pending={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await resolveRefundAction(storeId, orderId, refundId, outcome);
                setState(result);
                if (result.ok) setOpen(false);
                router.refresh();
              });
            }}
          >
            {label}
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
