"use client";

import { Button } from "@storevia/ui/button";
import { Switch } from "@storevia/ui/choice";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  saveLocationAction,
  setLocationActiveAction,
} from "@/app/(app)/s/[storeId]/inventory/actions";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";

interface LocationValues {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly fulfilsOnlineOrders: boolean;
}

export function LocationDialog({
  storeId,
  countries,
  defaultCountry,
  location,
  trigger,
}: {
  storeId: string;
  countries: readonly { value: string; label: string }[];
  defaultCountry?: string;
  location?: LocationValues;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    saveLocationAction.bind(null, storeId, location?.id ?? null),
    { ok: false },
  );
  const [fulfils, setFulfils] = useState(location?.fulfilsOnlineOrders ?? true);
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={location ? `Edit ${location.name}` : "Add location"}
      description="Stock is counted separately at each location."
      trigger={trigger ?? <Button leadingIcon={Plus}>Add location</Button>}
    >
      <form action={action} className="space-y-5" noValidate>
        {!state.ok ? <FormMessage state={state} /> : null}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <TextField
            label="Name"
            name="name"
            required
            state={state}
            defaultValue={location?.name}
            placeholder="Warehouse"
          />
          <TextField
            label="Code"
            name="code"
            required
            state={state}
            defaultValue={location?.code}
            placeholder="WH-1"
            hint="Short and unique."
            className="uppercase"
          />
        </div>
        <TextField
          label="Address"
          name="addressLine1"
          state={state}
          defaultValue={location?.addressLine1 ?? ""}
        />
        <TextField
          label="Address line 2"
          name="addressLine2"
          state={state}
          defaultValue={location?.addressLine2 ?? ""}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="City" name="city" state={state} defaultValue={location?.city ?? ""} />
          <TextField
            label="Region"
            name="region"
            state={state}
            defaultValue={location?.region ?? ""}
          />
          <TextField
            label="Postal code"
            name="postalCode"
            state={state}
            defaultValue={location?.postalCode ?? ""}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Country"
            name="countryCode"
            state={state}
            options={countries}
            defaultValue={location?.countryCode ?? defaultCountry ?? "IN"}
          />
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            state={state}
            defaultValue={location?.phone ?? ""}
          />
        </div>
        <Switch
          label="Fulfils online orders"
          description="Online orders can be shipped from here (used from Milestone 6)."
          checked={fulfils}
          onCheckedChange={setFulfils}
        />
        {fulfils ? <input type="hidden" name="fulfilsOnlineOrders" value="on" /> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <SubmitButton>{location ? "Save" : "Add location"}</SubmitButton>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function LocationRowActions({
  storeId,
  location,
  countries,
}: {
  storeId: string;
  location: LocationValues;
  countries: readonly { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex gap-2">
        <LocationDialog
          storeId={storeId}
          countries={countries}
          location={location}
          trigger={
            <Button size="sm" variant="secondary">
              Edit
            </Button>
          }
        />
        <Button
          size="sm"
          variant="ghost"
          pending={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await setLocationActiveAction(
                storeId,
                location.id,
                !location.isActive,
              );
              setError(result.ok ? null : (result.message ?? "That didn't work."));
              router.refresh();
            });
          }}
        >
          {location.isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="max-w-sm text-body-sm text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
