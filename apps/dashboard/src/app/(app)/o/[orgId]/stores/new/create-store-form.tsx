"use client";

import { normaliseSlug } from "@storevia/validation";
import { useActionState, useState } from "react";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, LOCALE_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/options";
import { createStoreAction } from "./actions";

export function CreateStoreForm({
  orgId,
  rootDomain,
  defaults,
}: {
  orgId: string;
  rootDomain: string;
  defaults: { currency: string; locale: string; timezone: string; country: string };
}) {
  const [state, action] = useActionState(createStoreAction.bind(null, orgId), { ok: false });
  const [slug, setSlug] = useState(state.values?.["slug"] ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Store name"
        name="name"
        required
        state={state}
        onChange={(event) => {
          if (!slugTouched) setSlug(normaliseSlug(event.currentTarget.value));
        }}
      />
      <TextField
        label="Store address"
        name="slug"
        required
        state={state}
        value={slug}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(event.currentTarget.value.toLowerCase());
        }}
        hint={
          <>
            Your store will be at{" "}
            <strong className="text-ink">
              {slug || "your-store"}.{rootDomain}
            </strong>
            . You can connect your own domain later.
          </>
        }
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Country"
          name="country"
          state={state}
          options={COUNTRY_OPTIONS}
          defaultValue={defaults.country}
        />
        <SelectField
          label="Currency"
          name="currency"
          state={state}
          options={CURRENCY_OPTIONS}
          defaultValue={defaults.currency}
          hint="Prices are shown and charged in this currency."
        />
        <SelectField
          label="Language"
          name="locale"
          state={state}
          options={LOCALE_OPTIONS}
          defaultValue={defaults.locale}
        />
        <SelectField
          label="Time zone"
          name="timezone"
          state={state}
          options={TIMEZONE_OPTIONS}
          defaultValue={defaults.timezone}
        />
      </div>
      <div className="flex justify-end">
        <SubmitButton>Create store</SubmitButton>
      </div>
    </form>
  );
}
