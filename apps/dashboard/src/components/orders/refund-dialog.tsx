"use client";

import { Button } from "@storevia/ui/button";
import { Checkbox } from "@storevia/ui/choice";
import { Field, Input, Select, Textarea } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert } from "@storevia/ui/surfaces";
import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refundOrderAction } from "@/app/(app)/s/[storeId]/orders/actions";
import type { FormState } from "@/components/forms";

export interface RefundPaymentOption {
  readonly id: string;
  /** "Razorpay · ₹1,299.00 captured". */
  readonly label: string;
  /** Decimal amount still refundable, e.g. "1299.00". */
  readonly refundable: string;
  /** The same, formatted in the order currency. */
  readonly refundableText: string;
}

export interface RefundLine {
  readonly id: string;
  readonly title: string;
  readonly variantTitle: string | null;
  /** Units not refunded yet. */
  readonly refundable: number;
  /** Fulfilled units that can still go back on sale. */
  readonly restockable: number;
}

interface LineDraft {
  quantity: string;
  restock: boolean;
}

/**
 * Refunds money to the customer through the payment provider, up to what
 * was captured minus earlier refunds. Units can be recorded against the
 * refund and, when they were shipped and have come back, put back on sale.
 */
export function RefundDialog({
  storeId,
  orderId,
  orderLabel,
  currency,
  payments,
  lines,
  locations,
  defaultLocationId,
}: {
  storeId: string;
  orderId: string;
  orderLabel: string;
  currency: string;
  /** Captured payments with money left to refund; the primary one first. */
  payments: readonly RefundPaymentOption[];
  lines: readonly RefundLine[];
  /** Active locations restocked units can go to (empty without inventory access). */
  locations: readonly { readonly id: string; readonly name: string }[];
  defaultLocationId: string;
}) {
  const router = useRouter();
  const first = payments[0];
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState(first?.id ?? "");
  const [amount, setAmount] = useState(first?.refundable ?? "");
  const [reason, setReason] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId);
  const blank = () =>
    Object.fromEntries(lines.map((l) => [l.id, { quantity: "", restock: false }])) as Record<
      string,
      LineDraft
    >;
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(blank);
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const payment = payments.find((p) => p.id === paymentId) ?? first;
  const draft = (id: string): LineDraft => drafts[id] ?? { quantity: "", restock: false };
  const update = (id: string, change: Partial<LineDraft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...draft(id), ...change } }));
  };
  const lineError = (l: RefundLine): string | undefined => {
    const raw = draft(l.id).quantity.trim();
    if (raw === "") return undefined;
    const q = Number(raw);
    if (!Number.isInteger(q) || q < 0 || q > l.refundable) {
      return `Enter 0 to ${String(l.refundable)}.`;
    }
    if (draft(l.id).restock && q > l.restockable) {
      return `Only ${String(l.restockable)} shipped ${l.restockable === 1 ? "unit" : "units"} can be restocked.`;
    }
    return undefined;
  };
  const restocking = lines.some(
    (l) => draft(l.id).restock && Number(draft(l.id).quantity.trim() || "0") > 0,
  );
  const invalid =
    lines.some((l) => lineError(l) !== undefined) ||
    !/^\d+(\.\d+)?$/.test(amount.trim()) ||
    Number(amount) <= 0 ||
    (restocking && !locationId);
  const reset = () => {
    setPaymentId(first?.id ?? "");
    setAmount(first?.refundable ?? "");
    setReason("");
    setLocationId(defaultLocationId);
    setDrafts(blank());
    setState({ ok: false });
  };
  if (!first) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
      trigger={
        <Button variant="secondary" leadingIcon={Undo2}>
          Refund
        </Button>
      }
      title={`Refund ${orderLabel}`}
      description="The money goes back through the payment provider it was paid with."
      size="lg"
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (invalid) return;
          startTransition(async () => {
            const result = await refundOrderAction(storeId, orderId, {
              amount,
              reason,
              paymentId,
              locationId: restocking ? locationId : "",
              lines: lines.map((l) => ({
                lineId: l.id,
                quantity: draft(l.id).quantity,
                restock: draft(l.id).restock,
              })),
            });
            setState(result);
            router.refresh();
            if (result.ok) setOpen(false);
          });
        }}
      >
        {!state.ok && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        {payments.length > 1 ? (
          <Field label="Payment" error={state.fieldErrors?.["paymentId"]}>
            <Select
              value={paymentId}
              onChange={(event) => {
                const next = payments.find((p) => p.id === event.currentTarget.value);
                setPaymentId(event.currentTarget.value);
                if (next) setAmount(next.refundable);
              }}
            >
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label={`Amount (${currency})`}
          description={payment ? `Up to ${payment.refundableText} can be refunded.` : undefined}
          error={state.fieldErrors?.["amount"]}
          required
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => {
              setAmount(event.currentTarget.value);
            }}
          />
        </Field>
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
        {lines.length > 0 ? (
          <fieldset>
            <legend className="text-label text-ink">
              Items <span className="font-normal text-ink-faint">Optional</span>
            </legend>
            <p className="mt-1 mb-3 text-label font-normal text-ink-muted">
              Record which items this refund covers. Only shipped items that came back can be put
              back on sale.
            </p>
            <ul className="divide-y divide-line rounded-card border border-line">
              {lines.map((l) => {
                const d = draft(l.id);
                const name = `${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ""}`;
                return (
                  <li key={l.id} className="grid gap-3 px-4 py-3">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-start">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium break-words text-ink">{l.title}</p>
                        <p className="text-caption text-ink-muted">
                          {l.variantTitle ? `${l.variantTitle} · ` : ""}
                          {l.refundable.toLocaleString("en-IN")} refundable
                        </p>
                      </div>
                      <Field label={`Units of ${name} to refund`} hideLabel error={lineError(l)}>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={l.refundable}
                          step={1}
                          placeholder="0"
                          value={d.quantity}
                          onChange={(event) => {
                            update(l.id, { quantity: event.currentTarget.value });
                          }}
                        />
                      </Field>
                    </div>
                    {l.restockable > 0 && locations.length > 0 ? (
                      <Checkbox
                        label="Put back in stock"
                        description={`${l.restockable.toLocaleString("en-IN")} shipped ${l.restockable === 1 ? "unit" : "units"} can go back on sale.`}
                        aria-label={`Put back in stock: ${name}`}
                        checked={d.restock}
                        onCheckedChange={(value) => {
                          update(l.id, { restock: value === true });
                        }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {state.fieldErrors?.["lines"] ? (
              <p className="mt-2 text-label text-danger-700">{state.fieldErrors["lines"]}</p>
            ) : null}
          </fieldset>
        ) : null}
        {restocking ? (
          <Field label="Restock at" error={state.fieldErrors?.["locationId"]}>
            <Select
              value={locationId}
              onChange={(event) => {
                setLocationId(event.currentTarget.value);
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" pending={pending} disabled={invalid}>
            Refund {currency} {amount.trim() || "0"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
