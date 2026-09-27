"use client";

import { Field, Textarea } from "@storevia/ui/form";
import { useActionState } from "react";
import { saveCustomerAction } from "@/app/(app)/s/[storeId]/customers/actions";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";

/** The merchant's own note and tags for a customer (contact details come from orders). */
export function CustomerNotesForm({
  storeId,
  customerId,
  note,
  tags,
}: {
  storeId: string;
  customerId: string;
  note: string;
  tags: readonly string[];
}) {
  const [state, action] = useActionState(saveCustomerAction.bind(null, storeId, customerId), {
    ok: false,
  });
  return (
    <form action={action} className="space-y-4">
      <Field
        label="Note"
        description="Only your team sees this."
        error={state.fieldErrors?.["note"]}
      >
        <Textarea
          name="note"
          rows={3}
          maxLength={5000}
          defaultValue={state.values?.["note"] ?? note}
        />
      </Field>
      <TextField
        label="Tags"
        name="tags"
        state={state}
        defaultValue={tags.join(", ")}
        hint="Separate tags with commas, e.g. wholesale, VIP."
        maxLength={2000}
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <FormMessage state={state} variant="inline" className="mr-auto" />
        <SubmitButton size="sm" variant="secondary">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}
