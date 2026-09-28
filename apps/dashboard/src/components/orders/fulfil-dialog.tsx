"use client";

import { Button } from "@storevia/ui/button";
import { METHOD_LABELS, type FulfilmentMethod } from "@storevia/commerce/order-lifecycle";
import { Field, Input, Select } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert } from "@storevia/ui/surfaces";
import { PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fulfilOrderAction } from "@/app/(app)/s/[storeId]/orders/actions";
import type { FormState } from "@/components/forms";

export interface FulfilLine {
  readonly id: string;
  readonly title: string;
  readonly variantTitle: string | null;
  readonly sku: string | null;
  /** Units still to ship. */
  readonly remaining: number;
}

/** Where a new fulfilment starts, per method. */
const START_OPTIONS: Readonly<
  Record<FulfilmentMethod, readonly { value: string; label: string }[]>
> = {
  SHIPPING: [
    { value: "SHIPPED", label: "Shipped (handed to the carrier)" },
    { value: "READY", label: "Ready (packed, not yet sent)" },
  ],
  LOCAL_DELIVERY: [
    { value: "READY", label: "Ready (packed, not yet sent)" },
    { value: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  ],
};

/**
 * Fulfils units: a quantity per line (defaulting to everything still to
 * ship), how it's delivered (carrier shipping or local delivery), where it
 * starts, and optional tracking. Reserved stock ships out. Delivery is never
 * assumed: it is marked later, on the fulfilment.
 */
export function FulfilDialog({
  storeId,
  orderId,
  orderLabel,
  lines,
}: {
  storeId: string;
  orderId: string;
  orderLabel: string;
  lines: readonly FulfilLine[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, String(l.remaining)])),
  );
  const [tracking, setTracking] = useState({ company: "", number: "", url: "" });
  const [method, setMethod] = useState<FulfilmentMethod>("SHIPPING");
  const [start, setStart] = useState("SHIPPED");
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const total = lines.reduce((n, l) => {
    const q = Number(quantities[l.id] ?? "0");
    return n + (Number.isInteger(q) && q > 0 ? q : 0);
  }, 0);
  const invalidLine = lines.find((l) => {
    const raw = quantities[l.id] ?? "";
    if (raw.trim() === "") return false;
    const q = Number(raw);
    return !Number.isInteger(q) || q < 0 || q > l.remaining;
  });
  const reset = () => {
    setQuantities(Object.fromEntries(lines.map((l) => [l.id, String(l.remaining)])));
    setTracking({ company: "", number: "", url: "" });
    setMethod("SHIPPING");
    setStart("SHIPPED");
    setState({ ok: false });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
      trigger={<Button leadingIcon={PackageCheck}>Fulfil items</Button>}
      title={`Fulfil ${orderLabel}`}
      description="Mark the items you've packed. The customer's order page shows each step until you mark it delivered."
      size="lg"
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (invalidLine || total === 0) return;
          startTransition(async () => {
            const result = await fulfilOrderAction(storeId, orderId, {
              lines: lines.map((l) => ({ lineId: l.id, quantity: quantities[l.id] ?? "" })),
              trackingCompany: tracking.company,
              trackingNumber: tracking.number,
              trackingUrl: tracking.url,
              method,
              status: start,
            });
            setState(result);
            if (result.ok) {
              setOpen(false);
              router.refresh();
            }
          });
        }}
      >
        {!state.ok && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <fieldset className="space-y-3">
          <legend className="mb-2 text-label text-ink">Items to fulfil</legend>
          <ul className="divide-y divide-line rounded-card border border-line">
            {lines.map((l) => {
              const raw = quantities[l.id] ?? "";
              const q = Number(raw);
              const error =
                raw.trim() !== "" && (!Number.isInteger(q) || q < 0 || q > l.remaining)
                  ? `Enter 0 to ${String(l.remaining)}.`
                  : undefined;
              return (
                <li
                  key={l.id}
                  className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-start"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium break-words text-ink">{l.title}</p>
                    <p className="text-caption text-ink-muted">
                      {[l.variantTitle, l.sku ? `SKU ${l.sku}` : null].filter(Boolean).join(" · ")}
                      {l.variantTitle || l.sku ? " · " : ""}
                      {l.remaining.toLocaleString("en-IN")} to ship
                    </p>
                  </div>
                  <Field
                    label={`Quantity of ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ""}`}
                    hideLabel
                    error={error}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={l.remaining}
                      step={1}
                      value={raw}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setQuantities((current) => ({ ...current, [l.id]: value }));
                      }}
                    />
                  </Field>
                </li>
              );
            })}
          </ul>
          {state.fieldErrors?.["lines"] ? (
            <p className="text-label text-danger-700">{state.fieldErrors["lines"]}</p>
          ) : null}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery method" error={state.fieldErrors?.["method"]}>
            <Select
              value={method}
              onChange={(event) => {
                const next = event.currentTarget.value as FulfilmentMethod;
                setMethod(next);
                setStart(next === "SHIPPING" ? "SHIPPED" : "READY");
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
              value={start}
              onChange={(event) => {
                setStart(event.currentTarget.value);
              }}
            >
              {START_OPTIONS[method].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className="space-y-4">
          <legend className="mb-2 text-label text-ink">
            Tracking <span className="font-normal text-ink-faint">Optional</span>
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Carrier" error={state.fieldErrors?.["trackingCompany"]}>
              <Input
                value={tracking.company}
                maxLength={100}
                placeholder="Delhivery"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setTracking((t) => ({ ...t, company: value }));
                }}
              />
            </Field>
            <Field label="Tracking number" error={state.fieldErrors?.["trackingNumber"]}>
              <Input
                value={tracking.number}
                maxLength={100}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setTracking((t) => ({ ...t, number: value }));
                }}
              />
            </Field>
          </div>
          <Field label="Tracking link" error={state.fieldErrors?.["trackingUrl"]}>
            <Input
              type="url"
              inputMode="url"
              value={tracking.url}
              maxLength={500}
              placeholder="https://"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setTracking((t) => ({ ...t, url: value }));
              }}
            />
          </Field>
        </fieldset>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" pending={pending} disabled={Boolean(invalidLine) || total === 0}>
            {total > 0
              ? `Fulfil ${total.toLocaleString("en-IN")} ${total === 1 ? "item" : "items"}`
              : "Fulfil items"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
