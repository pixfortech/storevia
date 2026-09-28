"use client";

import {
  METHOD_LABELS,
  nextShipmentStatus,
  SHIPMENT_FLOW,
  SHIPMENT_LABELS,
  type FulfilmentMethod,
  type ShipmentStatus,
} from "@storevia/commerce/order-lifecycle";
import { Button } from "@storevia/ui/button";
import { Checkbox } from "@storevia/ui/choice";
import { Field, Input, Select, Textarea } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert } from "@storevia/ui/surfaces";
import { Archive, ArchiveRestore, CheckCheck, KeyRound, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  archiveOrderAction,
  completeOrderAction,
  deleteDemoOrderAction,
  replyToMessageAction,
  resetCustomerLinkAction,
  updateFulfilmentAction,
} from "@/app/(app)/s/[storeId]/orders/actions";
import { FormMessage, SubmitButton, type FormState } from "@/components/forms";

// Order operations after payment (post-M7): archive, demo deletion, the
// fulfilment journey (status steps and edits), completion and replies. The
// services decide; these only collect input and show the outcome.

const ACTION_LABELS: Readonly<Record<ShipmentStatus, string>> = {
  READY: "Mark ready",
  SHIPPED: "Mark shipped",
  IN_TRANSIT: "Mark in transit",
  OUT_FOR_DELIVERY: "Mark out for delivery",
  DELIVERED: "Mark delivered",
};

function useOrderAction() {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<FormState>, onOk?: () => void) => {
    startTransition(async () => {
      const result = await fn();
      setState(result);
      if (result.ok) {
        onOk?.();
        router.refresh();
      }
    });
  };
  return { state, setState, pending, run };
}

/** Archive (out of the default list, kept whole) or restore. */
export function ArchiveOrderButton({
  storeId,
  orderId,
  archived,
}: {
  storeId: string;
  orderId: string;
  archived: boolean;
}) {
  const { state, pending, run } = useOrderAction();
  return (
    <>
      <Button
        variant="secondary"
        leadingIcon={archived ? ArchiveRestore : Archive}
        pending={pending}
        onClick={() => {
          run(() => archiveOrderAction(storeId, orderId, !archived));
        }}
      >
        {archived ? "Restore order" : "Archive order"}
      </Button>
      {!state.ok && state.message ? (
        <p role="alert" className="text-label text-danger-700">
          {state.message}
        </p>
      ) : null}
    </>
  );
}

/** Revokes the customer's order links and emails a new one (M8, S4). */
export function ResetCustomerLinkDialog({
  storeId,
  orderId,
  orderLabel,
}: {
  storeId: string;
  orderId: string;
  orderLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const { state, setState, pending, run } = useOrderAction();
  return (
    <>
      <Dialog
        role="alertdialog"
        size="sm"
        open={open}
        onOpenChange={(next) => {
          if (next) setState({ ok: false });
          setOpen(next);
        }}
        trigger={
          <Button variant="secondary" leadingIcon={KeyRound}>
            Reset customer link
          </Button>
        }
        title={`Reset the customer link for ${orderLabel}?`}
        description="Every link sent so far stops working at once. The customer is emailed a new one."
      >
        {!state.ok && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            pending={pending}
            onClick={() => {
              run(
                () => resetCustomerLinkAction(storeId, orderId),
                () => {
                  setOpen(false);
                },
              );
            }}
          >
            Reset link
          </Button>
        </DialogFooter>
      </Dialog>
      {state.ok && state.message ? (
        <p role="status" className="mt-3 text-body-sm text-ink-muted">
          {state.message}
        </p>
      ) : null}
    </>
  );
}

/** Development and test data only: typed confirmation, then the order is gone. */
export function DeleteDemoOrderDialog({
  storeId,
  orderId,
  orderLabel,
}: {
  storeId: string;
  orderId: string;
  orderLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const { state, setState, pending, run } = useOrderAction();
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setConfirm("");
          setState({ ok: false });
        }
        setOpen(next);
      }}
      trigger={
        <Button variant="danger-outline" leadingIcon={Trash2}>
          Delete demo order
        </Button>
      }
      title={`Delete demo order ${orderLabel}?`}
      description="Only for test orders in development. The order, its timeline and messages are removed for good. Real orders can only be archived."
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => deleteDemoOrderAction(storeId, orderId, { confirm }));
        }}
      >
        {!state.ok && state.message && !state.fieldErrors ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <Field label={`Type ${orderLabel} to confirm`} error={state.fieldErrors?.["confirm"]}>
          <Input
            value={confirm}
            autoComplete="off"
            onChange={(event) => {
              setConfirm(event.currentTarget.value);
            }}
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="submit"
            variant="danger"
            pending={pending}
            disabled={confirm.trim().replace(/^#/, "") !== orderLabel.replace(/^#/, "")}
          >
            Delete demo order
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export interface FulfilmentEditView {
  readonly id: string;
  readonly method: FulfilmentMethod;
  readonly status: ShipmentStatus;
  readonly trackingCompany: string;
  readonly trackingNumber: string;
  readonly trackingUrl: string;
  /** ISO strings. */
  readonly shippedAt: string | null;
  readonly deliveredAt: string | null;
}

/** The next journey step as one button (e.g. "Mark in transit"). */
export function FulfilmentStepButton({
  storeId,
  orderId,
  fulfilment,
}: {
  storeId: string;
  orderId: string;
  fulfilment: FulfilmentEditView;
}) {
  const next = nextShipmentStatus(fulfilment.method, fulfilment.status);
  const { state, pending, run } = useOrderAction();
  if (!next) return null;
  return (
    <>
      <Button
        size="sm"
        variant={next === "DELIVERED" ? "primary" : "secondary"}
        pending={pending}
        data-step={next}
        onClick={() => {
          run(() => updateFulfilmentAction(storeId, orderId, fulfilment.id, { status: next }));
        }}
      >
        {ACTION_LABELS[next]}
      </Button>
      {!state.ok && state.message ? (
        <p role="alert" className="basis-full text-label text-danger-700">
          {state.message}
        </p>
      ) : null}
    </>
  );
}

/** "YYYY-MM-DDTHH:mm" in the browser's time zone, for datetime-local. */
function localInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

/** Edit a fulfilment: method, status, tracking (add, replace or remove) and dates. */
export function EditFulfilmentDialog({
  storeId,
  orderId,
  fulfilment,
  trackingOnly,
}: {
  storeId: string;
  orderId: string;
  fulfilment: FulfilmentEditView;
  /** A completed order: only tracking can still change. */
  trackingOnly: boolean;
}) {
  const initial = () => ({
    method: fulfilment.method,
    status: fulfilment.status,
    company: fulfilment.trackingCompany,
    number: fulfilment.trackingNumber,
    url: fulfilment.trackingUrl,
    shippedAt: localInput(fulfilment.shippedAt),
    deliveredAt: localInput(fulfilment.deliveredAt),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const { state, setState, pending, run } = useOrderAction();
  const set = (patch: Partial<ReturnType<typeof initial>>) => {
    setForm((f) => ({ ...f, ...patch }));
  };
  const statuses = SHIPMENT_FLOW[form.method];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setForm(initial());
          setState({ ok: false });
        }
        setOpen(next);
      }}
      trigger={
        <Button size="sm" variant="ghost" leadingIcon={Pencil}>
          Edit
        </Button>
      }
      title="Edit fulfilment"
      description={
        trackingOnly
          ? "This order is complete, so only tracking details can change."
          : "Update how it's delivered, where it is, and its tracking. Clear a tracking field to remove it."
      }
      size="lg"
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () =>
              updateFulfilmentAction(storeId, orderId, fulfilment.id, {
                ...(trackingOnly
                  ? {}
                  : {
                      method: form.method,
                      status: form.status,
                      shippedAt: toIso(form.shippedAt),
                      deliveredAt: toIso(form.deliveredAt),
                    }),
                trackingCompany: form.company,
                trackingNumber: form.number,
                trackingUrl: form.url,
              }),
            () => {
              setOpen(false);
            },
          );
        }}
      >
        {!state.ok && state.message && !state.fieldErrors ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        {trackingOnly ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Delivery method" error={state.fieldErrors?.["method"]}>
              <Select
                value={form.method}
                onChange={(event) => {
                  const method = event.currentTarget.value as FulfilmentMethod;
                  const status = SHIPMENT_FLOW[method].includes(form.status)
                    ? form.status
                    : "READY";
                  set({ method, status });
                }}
              >
                {(Object.keys(METHOD_LABELS) as FulfilmentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" error={state.fieldErrors?.["status"]}>
              <Select
                value={form.status}
                onChange={(event) => {
                  set({ status: event.currentTarget.value as ShipmentStatus });
                }}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {SHIPMENT_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <fieldset className="space-y-4">
          <legend className="mb-2 text-label text-ink">
            Tracking <span className="font-normal text-ink-faint">Optional</span>
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Carrier" error={state.fieldErrors?.["trackingCompany"]}>
              <Input
                value={form.company}
                maxLength={100}
                placeholder="Delhivery"
                onChange={(event) => {
                  set({ company: event.currentTarget.value });
                }}
              />
            </Field>
            <Field label="Tracking number" error={state.fieldErrors?.["trackingNumber"]}>
              <Input
                value={form.number}
                maxLength={100}
                onChange={(event) => {
                  set({ number: event.currentTarget.value });
                }}
              />
            </Field>
          </div>
          <Field label="Tracking link" error={state.fieldErrors?.["trackingUrl"]}>
            <Input
              type="url"
              inputMode="url"
              value={form.url}
              maxLength={500}
              placeholder="https://"
              onChange={(event) => {
                set({ url: event.currentTarget.value });
              }}
            />
          </Field>
        </fieldset>
        {trackingOnly ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Shipped"
              optional
              description="Set when it leaves you."
              error={state.fieldErrors?.["shippedAt"]}
            >
              <Input
                type="datetime-local"
                value={form.shippedAt}
                disabled={form.status === "READY"}
                onChange={(event) => {
                  set({ shippedAt: event.currentTarget.value });
                }}
              />
            </Field>
            <Field
              label="Delivered"
              optional
              description="Set when it arrives."
              error={state.fieldErrors?.["deliveredAt"]}
            >
              <Input
                type="datetime-local"
                value={form.deliveredAt}
                disabled={form.status !== "DELIVERED"}
                onChange={(event) => {
                  set({ deliveredAt: event.currentTarget.value });
                }}
              />
            </Field>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" pending={pending}>
            Save fulfilment
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/**
 * Mark complete: straightforward once everything is paid, fulfilled and
 * delivered; otherwise the blockers are listed and completing anyway needs
 * an explicit confirmation and a reason (audited).
 */
export function CompleteOrderDialog({
  storeId,
  orderId,
  orderLabel,
  blockers,
}: {
  storeId: string;
  orderId: string;
  orderLabel: string;
  blockers: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const { state, setState, pending, run } = useOrderAction();
  const needsOverride = blockers.length > 0;
  return (
    <Dialog
      size="sm"
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOverride(false);
          setReason("");
          setState({ ok: false });
        }
        setOpen(next);
      }}
      trigger={
        <Button variant={needsOverride ? "secondary" : "primary"} leadingIcon={CheckCheck}>
          Mark complete
        </Button>
      }
      title={`Complete ${orderLabel}?`}
      description={
        needsOverride
          ? "This order isn't ready to complete yet."
          : "It's paid, fulfilled and delivered. Completing closes it: no more fulfilment or cancellation, though refunds stay possible."
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => completeOrderAction(storeId, orderId, { override, reason }),
            () => {
              setOpen(false);
            },
          );
        }}
      >
        {!state.ok && state.message && !state.fieldErrors ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        {needsOverride ? (
          <>
            <Alert tone="warning" title="Not ready">
              <ul className="list-disc pl-5">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Alert>
            <Checkbox
              label="Complete it anyway"
              description="Recorded in the audit log with your reason."
              checked={override}
              onCheckedChange={(checked) => {
                setOverride(checked === true);
              }}
            />
            <Field label="Reason" required error={state.fieldErrors?.["reason"]}>
              <Textarea
                rows={2}
                maxLength={500}
                value={reason}
                disabled={!override}
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                }}
              />
            </Field>
          </>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="submit"
            pending={pending}
            disabled={needsOverride && (!override || reason.trim() === "")}
          >
            {needsOverride ? "Complete anyway" : "Mark complete"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** The store's reply to the customer; sent to them by email. */
export function ReplyForm({
  storeId,
  orderId,
  max,
}: {
  storeId: string;
  orderId: string;
  max: number;
}) {
  const [state, action] = useActionState(replyToMessageAction.bind(null, storeId, orderId), {
    ok: false,
  });
  return (
    <form action={action} className="space-y-3">
      <Field
        label="Reply to the customer"
        description="Plain text. The customer gets it by email, with a link to their order."
        error={state.fieldErrors?.["body"]}
      >
        <Textarea
          name="body"
          rows={3}
          required
          maxLength={max}
          defaultValue={state.ok ? "" : (state.values?.["body"] ?? "")}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <FormMessage state={state} variant="inline" className="mr-auto" />
        <SubmitButton size="sm">Send reply</SubmitButton>
      </div>
    </form>
  );
}
