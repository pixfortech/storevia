"use client";

import { Button, CardBody, CardFooter } from "@storevia/ui";
import { useActionState } from "react";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { leaveOrganisationAction, renameOrganisationAction } from "./actions";

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
