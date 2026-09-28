"use client";

import { Button } from "@storevia/ui/button";
import { CardBody, CardFooter } from "@storevia/ui/surfaces";
import { useActionState } from "react";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import {
  leaveOrganisationAction,
  renameOrganisationAction,
  requestDeletionAction,
} from "./actions";

export function OrganisationNameForm({
  orgId,
  name,
  canEdit,
}: {
  orgId: string;
  name: string;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(renameOrganisationAction.bind(null, orgId), { ok: false });
  return (
    <form action={action} noValidate>
      <CardBody>
        <TextField
          label="Organisation name"
          name="name"
          defaultValue={name}
          disabled={!canEdit}
          required
          state={state}
          hint={canEdit ? "Usually your business or brand name." : undefined}
        />
      </CardBody>
      <CardFooter className="justify-between">
        {canEdit ? (
          <>
            <FormMessage state={state} variant="inline" />
            <SubmitButton className="ml-auto">Save</SubmitButton>
          </>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Only owners and admins can change these details.
          </p>
        )}
      </CardFooter>
    </form>
  );
}

export function LeaveOrganisationForm({ orgId }: { orgId: string }) {
  const [state, action] = useActionState(leaveOrganisationAction.bind(null, orgId), { ok: false });
  return (
    <ConfirmDialog
      title="Leave this organisation?"
      description="You'll lose access to all of its stores, and you'll need a new invitation to come back."
      confirmLabel="Leave"
      action={action}
      state={state}
      trigger={<Button variant="danger-outline">Leave organisation</Button>}
    />
  );
}

/** Owner only: the name typed out; the service also needs a recent password (M8). */
export function DeleteOrganisationForm({
  orgId,
  name,
  coolingOffDays,
}: {
  orgId: string;
  name: string;
  coolingOffDays: number;
}) {
  const [state, action] = useActionState(requestDeletionAction.bind(null, orgId), { ok: false });
  return (
    <ConfirmDialog
      title="Delete this organisation?"
      description={`Every store closes now. After ${String(coolingOffDays)} days, customers' personal data is erased and your team, domains, media and payment connections are removed. Orders, payments and refunds are kept, without personal data, for your legal records. You can cancel from your account page until then. To keep a copy, export your data first (Your data, above).`}
      confirmLabel="Delete organisation"
      action={action}
      state={state}
      trigger={<Button variant="danger-outline">Delete organisation</Button>}
    >
      <TextField
        label={`Type ${name} to confirm`}
        name="confirmName"
        autoComplete="off"
        required
        state={state}
      />
    </ConfirmDialog>
  );
}
