"use client";

import { Button } from "@storevia/ui/button";
import { Switch } from "@storevia/ui/choice";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, type ReactNode } from "react";
import {
  deleteShippingRateAction,
  deleteShippingZoneAction,
  saveShippingRateAction,
  saveShippingZoneAction,
} from "@/app/(app)/s/[storeId]/settings/shipping/actions";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { useCloseOnSave } from "./use-close-on-save";

// Shipping zone and rate dialogs. Each form mounts when its dialog opens, so
// it starts from the saved values every time; on success the dialog closes
// and the page refreshes.

export interface ZoneValues {
  readonly id: string;
  readonly name: string;
  /** "IN, US". */
  readonly countries: string;
  /** "KA, MH" (a single-country zone only). */
  readonly regions: string;
}

export interface RateValues {
  readonly id: string;
  readonly name: string;
  readonly type: "FLAT" | "PRICE_BASED";
  /** Decimal strings in the store currency ("40.00"); "" when unset. */
  readonly amount: string;
  readonly minSubtotal: string;
  readonly maxSubtotal: string;
  readonly active: boolean;
}

export function ZoneDialog({
  storeId,
  zone,
  trigger,
}: {
  storeId: string;
  zone?: ZoneValues;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={zone ? `Edit ${zone.name}` : "Add shipping zone"}
      description="A zone is the countries (or one country's regions) that share the same shipping rates."
      trigger={trigger ?? <Button leadingIcon={Plus}>Add zone</Button>}
    >
      <ZoneForm
        storeId={storeId}
        {...(zone ? { zone } : {})}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </Dialog>
  );
}

function ZoneForm({
  storeId,
  zone,
  onSaved,
}: {
  storeId: string;
  zone?: ZoneValues;
  onSaved: () => void;
}) {
  const [state, action] = useActionState(
    saveShippingZoneAction.bind(null, storeId, zone?.id ?? null),
    { ok: false },
  );
  useCloseOnSave(state, onSaved);
  return (
    <form action={action} className="space-y-5" noValidate>
      {!state.ok ? <FormMessage state={state} /> : null}
      <TextField
        label="Zone name"
        name="name"
        required
        state={state}
        defaultValue={zone?.name}
        placeholder="Domestic"
      />
      <TextField
        label="Countries"
        name="countries"
        required
        state={state}
        defaultValue={zone?.countries}
        placeholder="IN"
        autoCapitalize="characters"
        hint="Two-letter country codes, separated by commas: IN, or US, CA. Each country can be in one zone only."
      />
      <TextField
        label="Regions"
        name="regions"
        state={state}
        defaultValue={zone?.regions}
        placeholder="KA, MH"
        autoCapitalize="characters"
        hint="Optional, for a zone with one country: state or region codes separated by commas. Leave empty to cover the whole country."
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton>{zone ? "Save zone" : "Add zone"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

const RATE_TYPES = [
  { value: "FLAT", label: "Flat rate" },
  { value: "PRICE_BASED", label: "Based on order subtotal" },
] as const;

export function RateDialog({
  storeId,
  zoneId,
  zoneName,
  currency,
  rate,
  trigger,
}: {
  storeId: string;
  zoneId: string;
  zoneName: string;
  currency: string;
  rate?: RateValues;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={rate ? `Edit ${rate.name}` : `Add a rate to ${zoneName}`}
      description="Shoppers in this zone choose from its active rates at checkout."
      trigger={
        trigger ?? (
          <Button size="sm" variant="secondary" leadingIcon={Plus}>
            Add rate<span className="sr-only"> to {zoneName}</span>
          </Button>
        )
      }
    >
      <RateForm
        storeId={storeId}
        zoneId={zoneId}
        currency={currency}
        {...(rate ? { rate } : {})}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </Dialog>
  );
}

function RateForm({
  storeId,
  zoneId,
  currency,
  rate,
  onSaved,
}: {
  storeId: string;
  zoneId: string;
  currency: string;
  rate?: RateValues;
  onSaved: () => void;
}) {
  const [state, action] = useActionState(
    saveShippingRateAction.bind(null, storeId, zoneId, rate?.id ?? null),
    { ok: false },
  );
  useCloseOnSave(state, onSaved);
  const [type, setType] = useState<string>(rate?.type ?? "FLAT");
  const [active, setActive] = useState(rate?.active ?? true);
  return (
    <form action={action} className="space-y-5" noValidate>
      {!state.ok ? <FormMessage state={state} /> : null}
      <TextField
        label="Rate name"
        name="name"
        required
        state={state}
        defaultValue={rate?.name}
        placeholder="Standard delivery"
        hint="Shoppers see this name at checkout."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Type"
          name="type"
          state={state}
          options={RATE_TYPES}
          value={type}
          onChange={(event) => {
            setType(event.target.value);
          }}
        />
        <TextField
          label="Price"
          name="amount"
          required
          state={state}
          defaultValue={rate?.amount ?? ""}
          placeholder="0"
          inputMode="decimal"
          addon={currency}
          hint="Enter 0 for free shipping."
        />
      </div>
      {type === "PRICE_BASED" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Minimum order subtotal"
            name="minSubtotal"
            state={state}
            defaultValue={rate?.minSubtotal ?? ""}
            inputMode="decimal"
            addon={currency}
            hint="Optional."
          />
          <TextField
            label="Maximum order subtotal"
            name="maxSubtotal"
            state={state}
            defaultValue={rate?.maxSubtotal ?? ""}
            inputMode="decimal"
            addon={currency}
            hint="Optional."
          />
        </div>
      ) : null}
      <p className="rounded-control bg-subtle px-3 py-2.5 text-body-sm text-ink-muted">
        <span className="font-medium text-ink">Free shipping over an amount:</span> choose
        &ldquo;Based on order subtotal&rdquo;, set the price to 0 and the minimum to that amount.
        Keep a paid rate with a lower maximum for smaller orders.
      </p>
      <Switch
        label="Active"
        description="Inactive rates are kept but not offered at checkout."
        checked={active}
        onCheckedChange={setActive}
      />
      <input type="hidden" name="active" value={active ? "on" : "off"} />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </DialogClose>
        <SubmitButton>{rate ? "Save rate" : "Add rate"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function DeleteZoneButton({
  storeId,
  zoneId,
  zoneName,
}: {
  storeId: string;
  zoneId: string;
  zoneName: string;
}) {
  const [state, action] = useActionState(deleteShippingZoneAction.bind(null, storeId, zoneId), {
    ok: false,
  });
  return (
    <ConfirmDialog
      title={`Delete ${zoneName}?`}
      description="Its rates are deleted too. Shoppers in these countries won't be offered shipping until another zone covers them."
      confirmLabel="Delete zone"
      action={action}
      state={state}
      trigger={
        <Button size="sm" variant="ghost">
          Delete zone<span className="sr-only"> {zoneName}</span>
        </Button>
      }
    />
  );
}

export function DeleteRateButton({
  storeId,
  rateId,
  rateName,
}: {
  storeId: string;
  rateId: string;
  rateName: string;
}) {
  const [state, action] = useActionState(deleteShippingRateAction.bind(null, storeId, rateId), {
    ok: false,
  });
  return (
    <ConfirmDialog
      title={`Delete ${rateName}?`}
      description="Shoppers won't be offered this rate any more. Orders already placed keep the shipping they paid."
      confirmLabel="Delete rate"
      action={action}
      state={state}
      trigger={
        <Button size="sm" variant="ghost">
          Delete<span className="sr-only"> {rateName}</span>
        </Button>
      }
    />
  );
}
