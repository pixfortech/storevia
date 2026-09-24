"use client";

import { useActionState } from "react";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { COUNTRY_OPTIONS } from "@/lib/options";
import { createOrganisationAction } from "./actions";

export function CreateOrganisationForm() {
  const [state, action] = useActionState(createOrganisationAction, { ok: false });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Business name"
        name="name"
        autoComplete="organization"
        required
        state={state}
        hint="You can change this later."
      />
      <SelectField
        label="Country"
        name="country"
        state={state}
        options={[{ value: "", label: "Select a country" }, ...COUNTRY_OPTIONS]}
        defaultValue=""
      />
      <SubmitButton className="w-full">Continue</SubmitButton>
    </form>
  );
}
