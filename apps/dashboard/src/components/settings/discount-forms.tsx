"use client";

import { Button } from "@storevia/ui/button";
import { DescriptionList } from "@storevia/ui/data";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import {
  deleteDiscountAction,
  saveDiscountAction,
  setDiscountActiveAction,
} from "@/app/(app)/s/[storeId]/marketing/actions";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { useCloseOnSave } from "./use-close-on-save";

// Discount code dialogs and row actions. The code and its type identify the
// discount on past orders, so they're fixed once it exists.

export interface DiscountValues {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly type: "PERCENTAGE" | "FIXED_AMOUNT";
  /** "10" (percent) or a decimal amount ("100.00"). */
  readonly value: string;
  readonly minSubtotal: string;
  /** datetime-local values in the store's time zone. */
  readonly startsAt: string;
  readonly endsAt: string;
  readonly usageLimit: string;
  readonly usageCount: number;
}

const TYPES = [
  { value: "PERCENTAGE", label: "Percentage off" },
  { value: "FIXED_AMOUNT", label: "Fixed amount off" },
] as const;

export function DiscountDialog({
  storeId,
  currency,
  timeZone,
  discount,
  trigger,
}: {
  storeId: string;
  currency: string;
  timeZone: string;
  discount?: DiscountValues;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={discount ? `Edit ${discount.code}` : "Create discount code"}
      description="Takes a percentage or a fixed amount off the whole order when a shopper enters the code at checkout."
      trigger={trigger ?? <Button leadingIcon={Plus}>Create code</Button>}
    >
      <DiscountForm
        storeId={storeId}
        currency={currency}
        timeZone={timeZone}
        {...(discount ? { discount } : {})}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </Dialog>
  );
}

function DiscountForm({
  storeId,
  currency,
  timeZone,
  discount,
  onSaved,
}: {
  storeId: string;
  currency: string;
  timeZone: string;
  discount?: DiscountValues;
  onSaved: () => void;
}) {
  const [state, action] = useActionState(
    saveDiscountAction.bind(null, storeId, discount?.id ?? null),
    { ok: false },
  );
  useCloseOnSave(state, onSaved);
  const [type, setType] = useState<string>(discount?.type ?? "PERCENTAGE");
  const zoneHint = `In your store's time zone (${timeZone.replace(/_/g, " ")}).`;
  return (
    <form action={action} className="space-y-5" noValidate>
      {!state.ok ? <FormMessage state={state} /> : null}
      {discount ? (
        <DescriptionList
          layout="stacked"
          columns={2}
          items={[
            { term: "Code", detail: <span className="font-mono">{discount.code}</span> },
            {
              term: "Type",
              detail: TYPES.find((t) => t.value === discount.type)?.label ?? discount.type,
            },
          ]}
          className="rounded-control bg-subtle px-3 py-2.5"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Code"
            name="code"
            required
            state={state}
            placeholder="WELCOME10"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
            hint="Letters, numbers, dashes or underscores. Shoppers can type it in any case."
          />
          <SelectField
            label="Type"
            name="type"
            state={state}
            options={TYPES}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
            }}
          />
        </div>
      )}
      <TextField
        label="Title"
        name="title"
        state={state}
        defaultValue={discount?.title ?? ""}
        placeholder="Welcome offer"
        hint="Optional. For your team; defaults to the code."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={type === "PERCENTAGE" ? "Percentage off" : "Amount off"}
          name="value"
          required
          state={state}
          defaultValue={discount?.value ?? ""}
          inputMode="decimal"
          placeholder={type === "PERCENTAGE" ? "10" : "100"}
          addon={type === "PERCENTAGE" ? "%" : currency}
        />
        <TextField
          label="Minimum order subtotal"
          name="minSubtotal"
          state={state}
          defaultValue={discount?.minSubtotal ?? ""}
          inputMode="decimal"
          addon={currency}
          hint="Optional."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Starts"
          name="startsAt"
          type="datetime-local"
          state={state}
          defaultValue={discount?.startsAt ?? ""}
          hint={discount ? zoneHint : `${zoneHint} Leave empty to start now.`}
        />
        <TextField
          label="Ends"
          name="endsAt"
          type="datetime-local"
          state={state}
          defaultValue={discount?.endsAt ?? ""}
          hint="Optional. Leave empty for no end date."
        />
      </div>
      <TextField
        label="Usage limit"
        name="usageLimit"
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        state={state}
        defaultValue={discount?.usageLimit ?? ""}
        hint={
          discount && discount.usageCount > 0
            ? `Optional. Total uses across all shoppers; used ${String(discount.usageCount)} times so far.`
            : "Optional. Total uses across all shoppers. Leave empty for no limit."
        }
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton>{discount ? "Save code" : "Create code"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function DiscountRowActions({
  storeId,
  currency,
  timeZone,
  discount,
  active,
}: {
  storeId: string;
  currency: string;
  timeZone: string;
  discount: DiscountValues;
  /** Not disabled (it may still be scheduled, expired or used up). */
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteState, deleteAction] = useActionState(
    deleteDiscountAction.bind(null, storeId, discount.id),
    { ok: false },
  );
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <div className="flex flex-wrap gap-2 md:justify-end">
        <DiscountDialog
          storeId={storeId}
          currency={currency}
          timeZone={timeZone}
          discount={discount}
          trigger={
            <Button size="sm" variant="secondary">
              Edit<span className="sr-only"> {discount.code}</span>
            </Button>
          }
        />
        <Button
          size="sm"
          variant="ghost"
          pending={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await setDiscountActiveAction(storeId, discount.id, !active);
              setError(result.ok ? null : (result.message ?? "That didn't work."));
              router.refresh();
            });
          }}
        >
          {active ? "Disable" : "Enable"}
          <span className="sr-only"> {discount.code}</span>
        </Button>
        {discount.usageCount === 0 ? (
          <ConfirmDialog
            title={`Delete ${discount.code}?`}
            description="The code stops working and is removed. Only codes that have never been used can be deleted."
            confirmLabel="Delete code"
            action={deleteAction}
            state={deleteState}
            trigger={
              <Button size="sm" variant="ghost">
                Delete<span className="sr-only"> {discount.code}</span>
              </Button>
            }
          />
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="max-w-sm text-body-sm text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
