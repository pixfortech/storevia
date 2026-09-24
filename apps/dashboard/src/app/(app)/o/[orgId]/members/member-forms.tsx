"use client";

import { Avatar, Badge, Button, Dialog, DialogClose, Select } from "@storevia/ui";
import { useActionState } from "react";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  setMemberStatusAction,
  transferOwnershipAction,
} from "./actions";

interface RoleOption {
  value: string;
  label: string;
}

export function InviteForm({ orgId, roles }: { orgId: string; roles: RoleOption[] }) {
  const [state, action] = useActionState(inviteMemberAction.bind(null, orgId), { ok: false });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <TextField label="Email" name="email" type="email" required state={state} />
        <SelectField
          label="Role"
          name="role"
          state={state}
          options={roles}
          defaultValue={roles.at(-1)?.value ?? "VIEWER"}
        />
        <SubmitButton>Send invitation</SubmitButton>
      </div>
    </form>
  );
}

interface MemberInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  status: "ACTIVE" | "SUSPENDED";
  isCurrentUser: boolean;
  storeScoped: boolean;
}

export function MemberRow({
  orgId,
  member,
  roles,
  canManage,
  canTransfer,
}: {
  orgId: string;
  member: MemberInfo;
  roles: RoleOption[];
  canManage: boolean;
  canTransfer: boolean;
}) {
  const [roleState, roleAction] = useActionState(changeRoleAction.bind(null, orgId, member.id), {
    ok: false,
  });
  const [statusState, statusAction] = useActionState(
    setMemberStatusAction.bind(
      null,
      orgId,
      member.id,
      member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
    ),
    { ok: false },
  );
  const [removeState, removeAction] = useActionState(
    removeMemberAction.bind(null, orgId, member.id),
    { ok: false },
  );
  const [transferState, transferAction] = useActionState(
    transferOwnershipAction.bind(null, orgId, member.id),
    { ok: false },
  );
  const message = [roleState, statusState, removeState, transferState].find((s) => s.message);
  return (
    <li className="px-5 py-4" data-testid="member-row" data-email={member.email}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">
            {member.name}{" "}
            {member.isCurrentUser ? <span className="text-ink-muted">(you)</span> : null}
          </p>
          <p className="truncate text-sm text-ink-muted">{member.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {member.status === "SUSPENDED" ? <Badge tone="warning">Suspended</Badge> : null}
          {member.storeScoped ? <Badge tone="info">Selected stores</Badge> : null}
          {canManage ? (
            <form action={roleAction} className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`role-${member.id}`}>
                Role for {member.name}
              </label>
              <Select
                id={`role-${member.id}`}
                name="role"
                defaultValue={member.role}
                className="h-9 w-44"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <SubmitButton size="sm" variant="secondary">
                Save
              </SubmitButton>
            </form>
          ) : (
            <Badge tone={member.role === "OWNER" ? "brand" : "neutral"}>{member.roleLabel}</Badge>
          )}
          {canManage ? (
            <>
              <form action={statusAction}>
                <SubmitButton size="sm" variant="ghost">
                  {member.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                </SubmitButton>
              </form>
              <Dialog
                title={`Remove ${member.name}?`}
                description="They lose access immediately. Anything they created stays."
                trigger={
                  <Button size="sm" variant="ghost" className="text-danger-700">
                    Remove
                  </Button>
                }
              >
                <form action={removeAction} className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <SubmitButton variant="danger">Remove member</SubmitButton>
                </form>
              </Dialog>
            </>
          ) : null}
          {canTransfer ? (
            <Dialog
              title={`Make ${member.name} the owner?`}
              description="You'll become an admin. Owners manage billing and can delete the organisation."
              trigger={
                <Button size="sm" variant="ghost">
                  Transfer ownership
                </Button>
              }
            >
              <form action={transferAction} className="space-y-3">
                <FormMessage state={transferState} />
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <SubmitButton>Transfer ownership</SubmitButton>
                </div>
              </form>
            </Dialog>
          ) : null}
        </div>
      </div>
      {message ? (
        <div className="mt-3">
          <FormMessage state={message} />
        </div>
      ) : null}
    </li>
  );
}

export function InvitationRow({
  orgId,
  invitation,
  canManage,
}: {
  orgId: string;
  invitation: { id: string; email: string; roleLabel: string; expires: string };
  canManage: boolean;
}) {
  const [state, action] = useActionState(revokeInvitationAction.bind(null, orgId, invitation.id), {
    ok: false,
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4" data-testid="invitation-row">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{invitation.email}</p>
        <p className="text-sm text-ink-muted">
          {invitation.roleLabel} · expires {new Date(invitation.expires).toLocaleDateString()}
        </p>
      </div>
      {canManage ? (
        <form action={action}>
          <SubmitButton size="sm" variant="ghost">
            Revoke
          </SubmitButton>
        </form>
      ) : null}
      {state.message ? <FormMessage state={state} /> : null}
    </li>
  );
}
