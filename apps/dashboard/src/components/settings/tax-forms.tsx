"use client";

import { Button } from "@storevia/ui/button";
import { Switch } from "@storevia/ui/choice";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { CardBody, CardFooter } from "@storevia/ui/surfaces";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, type ReactNode } from "react";
import {
  deleteTaxRateAction,
  saveTaxRateAction,
  updateTaxSettingsAction,
} from "@/app/(app)/s/[storeId]/settings/tax/actions";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { useCloseOnSave } from "./use-close-on-save";

export function TaxOptionsForm({
  storeId,
  canEdit,
  values,
}: {
  storeId: string;
  canEdit: boolean;
  values: {
    readonly pricesIncludeTax: boolean;
    readonly chargeTaxOnShipping: boolean;
    readonly taxRegistrationId: string;
  };
}) {
  const [state, action] = useActionState(updateTaxSettingsAction.bind(null, storeId), {
    ok: false,
  });
  const [inclusive, setInclusive] = useState(values.pricesIncludeTax);
  const [shipping, setShipping] = useState(values.chargeTaxOnShipping);
  return (
    <form action={action} noValidate>
      <fieldset disabled={!canEdit} className="min-w-0">
        <CardBody className="space-y-6 py-6">
          <Switch
            labelPosition="start"
            label="Prices include tax"
            description="On: the prices you set already include tax, and checkout shows the tax inside them. Off: tax is added on top at checkout."
            checked={inclusive}
            onCheckedChange={setInclusive}
            disabled={!canEdit}
          />
          {inclusive ? <input type="hidden" name="pricesIncludeTax" value="on" /> : null}
          <Switch
            labelPosition="start"
            label="Charge tax on shipping"
            description="Applies the same rate to the shipping price as to the products."
            checked={shipping}
            onCheckedChange={setShipping}
            disabled={!canEdit}
          />
          {shipping ? <input type="hidden" name="chargeTaxOnShipping" value="on" /> : null}
          <TextField
            label="Tax registration number"
            name="taxRegistrationId"
            state={state}
            defaultValue={values.taxRegistrationId}
            placeholder="GSTIN, VAT or sales tax number"
            hint="Optional. Kept with your tax settings for your records; it isn't printed on orders yet."
            autoComplete="off"
          />
        </CardBody>
      </fieldset>
      {canEdit ? (
        <CardFooter className="justify-between">
          <FormMessage state={state} variant="inline" />
          <SubmitButton className="ml-auto">Save tax settings</SubmitButton>
        </CardFooter>
      ) : null}
    </form>
  );
}

export interface TaxRateValues {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly regionCode: string;
  /** "18", "7.25". */
  readonly rate: string;
}

export function TaxRateDialog({
  storeId,
  countries,
  defaultCountry,
  rate,
  trigger,
}: {
  storeId: string;
  countries: readonly { value: string; label: string }[];
  defaultCountry: string;
  rate?: TaxRateValues;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={rate ? `Edit ${rate.name}` : "Add tax rate"}
      description="Charged on orders shipped to this country (or one of its regions)."
      trigger={
        trigger ?? (
          <Button size="sm" leadingIcon={Plus}>
            Add tax rate
          </Button>
        )
      }
    >
      <TaxRateForm
        storeId={storeId}
        countries={countries}
        defaultCountry={defaultCountry}
        {...(rate ? { rate } : {})}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </Dialog>
  );
}

function TaxRateForm({
  storeId,
  countries,
  defaultCountry,
  rate,
  onSaved,
}: {
  storeId: string;
  countries: readonly { value: string; label: string }[];
  defaultCountry: string;
  rate?: TaxRateValues;
  onSaved: () => void;
}) {
  const [state, action] = useActionState(saveTaxRateAction.bind(null, storeId, rate?.id ?? null), {
    ok: false,
  });
  useCloseOnSave(state, onSaved);
  return (
    <form action={action} className="space-y-5" noValidate>
      {!state.ok ? <FormMessage state={state} /> : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <TextField
          label="Name"
          name="name"
          required
          state={state}
          defaultValue={rate?.name}
          placeholder="GST"
          hint="Shown to shoppers beside the tax amount."
        />
        <TextField
          label="Rate"
          name="rate"
          required
          state={state}
          defaultValue={rate?.rate}
          placeholder="18"
          inputMode="decimal"
          addon="%"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Country"
          name="countryCode"
          state={state}
          options={countries}
          defaultValue={rate?.countryCode ?? defaultCountry}
        />
        <TextField
          label="Region code"
          name="regionCode"
          state={state}
          defaultValue={rate?.regionCode ?? ""}
          placeholder="KA"
          autoCapitalize="characters"
          hint="Optional. Leave empty for the whole country."
        />
      </div>
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

export function DeleteTaxRateButton({
  storeId,
  rateId,
  rateName,
}: {
  storeId: string;
  rateId: string;
  rateName: string;
}) {
  const [state, action] = useActionState(deleteTaxRateAction.bind(null, storeId, rateId), {
    ok: false,
  });
  return (
    <ConfirmDialog
      title={`Delete ${rateName}?`}
      description="New orders won't be charged this rate. Orders already placed keep the tax they were charged."
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
