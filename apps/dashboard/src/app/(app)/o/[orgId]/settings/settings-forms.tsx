"use client";

import { Button, Dialog, DialogClose } from "@storevia/ui";
import { useActionState } from "react";
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
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Organisation name"
        name="name"
        defaultValue={name}
        disabled={!canEdit}
        required
        state={state}
      />
      {canEdit ? (
        <div className="flex justify-end">
          <SubmitButton>Save</SubmitButton>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Only owners and admins can change these details.</p>
      )}
    </form>
  );
}

export function LeaveOrganisationForm({ orgId }: { orgId: string }) {
  const [state, action] = useActionState(leaveOrganisationAction.bind(null, orgId), { ok: false });
  return (
    <Dialog
      title="Leave this organisation?"
      description="You'll need a new invitation to come back."
      trigger={
        <Button variant="secondary" className="text-danger-700">
          Leave organisation
        </Button>
      }
    >
      <form action={action} className="space-y-3">
        <FormMessage state={state} />
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <SubmitButton variant="danger">Leave</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
