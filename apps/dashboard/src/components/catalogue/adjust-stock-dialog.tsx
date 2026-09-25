"use client";

import { Button } from "@storevia/ui/button";
import { Field, Input, Select, Textarea } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { SegmentedControl } from "@storevia/ui/segmented-control";
import { Alert } from "@storevia/ui/surfaces";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { adjustStockAction } from "@/app/(app)/s/[storeId]/inventory/actions";
import { ADJUSTMENT_REASONS } from "@/lib/catalogue";

// Records a stock change for one variant at one location: add or remove a
// number of units, or set the count found in a stock take. The server turns
// "set" into a delta under a row lock and writes the ledger entry with the
// reason, note and who did it.

export interface StockLocationOption {
  readonly id: string;
  readonly name: string;
  readonly available: number;
}

export function AdjustStockDialog({
  storeId,
  variantId,
  title,
  locations,
  defaultLocationId,
  trigger,
}: {
  storeId: string;
  variantId: string;
  /** What is being adjusted, e.g. "Linen shirt · M". */
  title: string;
  locations: readonly StockLocationOption[];
  defaultLocationId?: string | undefined;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"adjust" | "set">("adjust");
  const [locationId, setLocationId] = useState(defaultLocationId ?? locations[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS[0].value);
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const current = locations.find((l) => l.id === locationId)?.available ?? 0;
  const parsed = Number(quantity);
  const valid =
    quantity.trim() !== "" && Number.isInteger(parsed) && (mode === "set" || parsed !== 0);
  const after = valid ? (mode === "set" ? parsed : current + parsed) : null;

  const reset = () => {
    setQuantity("");
    setNote("");
    setError(null);
    setMode("adjust");
  };

  const submit = () => {
    startTransition(async () => {
      const result = await adjustStockAction(storeId, {
        mode,
        variantId,
        locationId,
        quantity,
        reason,
        note,
      });
      if (!result.ok) {
        setError({
          message: result.message ?? "That didn't work.",
          fields: { ...result.fieldErrors },
        });
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      trigger={trigger}
      title="Update stock"
      description={title}
      size="sm"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) submit();
        }}
      >
        {error ? <Alert tone="danger">{error.message}</Alert> : null}
        <SegmentedControl
          aria-label="How to change the stock"
          fullWidth
          value={mode}
          onValueChange={(value) => {
            setMode(value as "adjust" | "set");
            setReason(value === "set" ? "CORRECTION" : ADJUSTMENT_REASONS[0].value);
          }}
          options={[
            { value: "adjust", label: "Add or remove" },
            { value: "set", label: "Set count" },
          ]}
        />
        {locations.length > 1 ? (
          <Field label="Location">
            <Select
              value={locationId}
              onChange={(event) => {
                setLocationId(event.currentTarget.value);
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.available.toLocaleString("en-IN")} available)
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label={mode === "set" ? "Units counted" : "Change"}
          description={
            mode === "set"
              ? "The number actually on the shelf."
              : "Use a minus sign to remove units, e.g. -3."
          }
          error={error?.fields["delta"] ?? error?.fields["quantity"]}
        >
          <Input
            type="number"
            inputMode="numeric"
            step={1}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.currentTarget.value);
            }}
            autoFocus
          />
        </Field>
        <p
          className="rounded-control bg-subtle px-3 py-2 text-body-sm text-ink-muted"
          aria-live="polite"
        >
          {locations.find((l) => l.id === locationId)?.name ?? "This location"}:{" "}
          <span className="font-medium text-ink tabular-nums">
            {current.toLocaleString("en-IN")}
          </span>
          {after !== null ? (
            <>
              {" → "}
              <span
                className={
                  after < 0
                    ? "font-medium text-danger-700 tabular-nums"
                    : "font-medium text-ink tabular-nums"
                }
              >
                {after.toLocaleString("en-IN")}
              </span>
            </>
          ) : null}
        </p>
        <Field label="Reason">
          <Select
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
          >
            {ADJUSTMENT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}: {r.description}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Note"
          description="Optional. Kept in the stock history."
          error={error?.fields["note"]}
        >
          <Textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => {
              setNote(event.currentTarget.value);
            }}
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" pending={pending} disabled={!valid}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
