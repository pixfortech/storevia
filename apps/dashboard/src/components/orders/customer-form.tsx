"use client";

import { Field, Textarea } from "@storevia/ui/form";
import { useActionState } from "react";
import { eraseCustomerAction, saveCustomerAction } from "@/app/(app)/s/[storeId]/customers/actions";
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

/**
 * Erasing a customer's personal data (M8): a right-to-erasure request. The
 * orders stay for the accounts, without the name, contact details,
 * addresses or messages. Needs a recent password.
 */
export function EraseCustomerForm({
  storeId,
  customerId,
}: {
  storeId: string;
  customerId: string;
}) {
  const [state, action] = useActionState(eraseCustomerAction.bind(null, storeId, customerId), {
    ok: false,
  });
  return (
    <form action={action} className="space-y-4">
      <p className="text-body-sm text-ink-muted">
        Removes this customer&apos;s name, email, phone, note and tags, and on their orders the
        contact details, addresses (the state and country stay for tax) and messages. Their order
        links stop working. Amounts, payments and refunds are kept for your accounts. This
        can&apos;t be undone.
      </p>
      <FormMessage state={state} />
      <TextField
        label="Type ERASE to confirm"
        name="confirm"
        autoComplete="off"
        required
        state={state}
      />
      <SubmitButton variant="danger">Erase personal data</SubmitButton>
    </form>
  );
}
