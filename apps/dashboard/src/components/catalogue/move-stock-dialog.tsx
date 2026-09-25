"use client";

import { Button } from "@storevia/ui/button";
import { Field, Input, Select, Textarea } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert } from "@storevia/ui/surfaces";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { moveStockAction } from "@/app/(app)/s/[storeId]/inventory/actions";
import type { StockLocationOption } from "./adjust-stock-dialog";

/** Moves units of one variant between two of the store's locations (one transfer in the history). */
export function MoveStockDialog({
  storeId,
  variantId,
  title,
  locations,
  trigger,
}: {
  storeId: string;
  variantId: string;
  title: string;
  locations: readonly StockLocationOption[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(
    locations.find((l) => l.available > 0)?.id ?? locations[0]?.id ?? "",
  );
  const [to, setTo] = useState(locations.find((l) => l.id !== from)?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const source = locations.find((l) => l.id === from);
  const n = Number(quantity);
  const valid = from !== to && Number.isInteger(n) && n > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Move stock"
      description={title}
      size="sm"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          startTransition(async () => {
            const result = await moveStockAction(storeId, {
              variantId,
              fromLocationId: from,
              toLocationId: to,
              quantity,
              note,
            });
            if (!result.ok) {
              setError(result.message ?? "That didn't work.");
              return;
            }
            setOpen(false);
            setQuantity("");
            setNote("");
            setError(null);
            router.refresh();
          });
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">
            <Select
              value={from}
              onChange={(event) => {
                setFrom(event.currentTarget.value);
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.available.toLocaleString("en-IN")})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To" error={from === to ? "Choose a different location." : undefined}>
            <Select
              value={to}
              onChange={(event) => {
                setTo(event.currentTarget.value);
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Units"
          description={
            source
              ? `${source.available.toLocaleString("en-IN")} available at ${source.name}.`
              : undefined
          }
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.currentTarget.value);
            }}
          />
        </Field>
        <Field label="Note" description="Optional. Kept in the stock history.">
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
            Move stock
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
