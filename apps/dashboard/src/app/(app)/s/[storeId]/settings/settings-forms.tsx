"use client";

import {
  BUSINESS_TYPE_DEFINITIONS,
  isBusinessType,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { Button, Dialog, DialogClose, Field, GlyphTile, Input } from "@storevia/ui";
import { useActionState, useState } from "react";
import { BusinessTypePicker } from "@/components/business-type-picker";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { LOCALE_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/options";
import { archiveStoreAction, changeBusinessTypeAction, updateStoreAction } from "./actions";

export function StoreSettingsForm({
  storeId,
  canEdit,
  values,
  fixed,
}: {
  storeId: string;
  canEdit: boolean;
  values: {
    name: string;
    locale: string;
    timezone: string;
    contactEmail: string;
    supportEmail: string;
  };
  fixed: { currency: string; country: string; address: string };
}) {
  const [state, action] = useActionState(updateStoreAction.bind(null, storeId), { ok: false });
  const withCurrent = <T extends { value: string; label: string }>(
    options: readonly T[],
    current: string,
  ) =>
    options.some((o) => o.value === current)
      ? options
      : [{ value: current, label: current }, ...options];
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <fieldset disabled={!canEdit} className="space-y-5">
        <TextField
          label="Store name"
          name="name"
          defaultValue={values.name}
          required
          state={state}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Language"
            name="locale"
            state={state}
            options={withCurrent(LOCALE_OPTIONS, values.locale)}
            defaultValue={values.locale}
          />
          <SelectField
            label="Time zone"
            name="timezone"
            state={state}
            options={withCurrent(TIMEZONE_OPTIONS, values.timezone)}
            defaultValue={values.timezone}
          />
          <TextField
            label="Contact email"
            name="contactEmail"
            type="email"
            defaultValue={values.contactEmail}
            state={state}
          />
          <TextField
            label="Support email"
            name="supportEmail"
            type="email"
            defaultValue={values.supportEmail}
            state={state}
          />
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-3">
        {(
          [
            ["Web address", fixed.address],
            ["Currency", fixed.currency],
            ["Country", fixed.country],
          ] as const
        ).map(([label, value]) => (
          <Field
            key={label}
            label={label}
            hint={label === "Currency" ? "Fixed once the store is created." : undefined}
          >
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} value={value} readOnly disabled />
            )}
          </Field>
        ))}
      </div>
      {canEdit ? (
        <div className="flex justify-end">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function ArchiveStoreForm({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [state, action] = useActionState(archiveStoreAction.bind(null, storeId), { ok: false });
  return (
    <Dialog
      title={`Archive ${storeName}?`}
      description="The store disappears from your list. Its data is kept."
      trigger={
        <Button variant="secondary" className="text-danger-700">
          Archive store
        </Button>
      }
    >
      <form action={action} className="space-y-3">
        <FormMessage state={state} />
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <SubmitButton variant="danger">Archive</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

export function BusinessTypeForm({
  storeId,
  current,
  canEdit,
}: {
  storeId: string;
  current: BusinessType;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(changeBusinessTypeAction.bind(null, storeId), {
    ok: false,
  });
  // Remount after each result so the radios reflect the saved (or rejected) value.
  const [seen, setSeen] = useState(state);
  const [version, setVersion] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setVersion((v) => v + 1);
  }
  if (!canEdit) {
    const definition = BUSINESS_TYPE_DEFINITIONS[current];
    return (
      <div className="flex items-center gap-3.5">
        <GlyphTile name={BUSINESS_TYPE_GLYPH[current]} />
        <div>
          <p className="font-medium text-ink">{definition.label}</p>
          <p className="text-sm text-ink-muted">{definition.tagline}</p>
        </div>
      </div>
    );
  }
  const chosen = state.values?.["businessType"] ?? "";
  return (
    <form key={version} action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <BusinessTypePicker
        legend="This store is a…"
        defaultValue={!state.ok && isBusinessType(chosen) ? chosen : current}
        error={state.fieldErrors?.["businessType"]}
      />
      <div className="flex justify-end">
        <SubmitButton variant="secondary">Update business type</SubmitButton>
      </div>
    </form>
  );
}
