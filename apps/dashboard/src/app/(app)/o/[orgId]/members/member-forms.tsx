"use client";

import {
  Avatar,
  Badge,
  Button,
  cn,
  EmptyState,
  Icon,
  Illustration,
  SearchInput,
  SegmentedControl,
  Select,
} from "@storevia/ui";
import { Info, Mail, Store } from "lucide-react";
import { useActionState, useState } from "react";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import {
  filterMembers,
  MEMBER_FILTER_THRESHOLD,
  type MemberStatusFilter,
} from "@/lib/areas/members";
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

export interface RolePresetOption {
  role: string;
  label: string;
  description: string;
}

/**
 * Invitation form. Presets suggested by the organisation's business types are
 * shortcuts that select an existing role; the server checks the role as usual.
 */
export function InviteForm({
  orgId,
  roles,
  presets,
}: {
  orgId: string;
  roles: RoleOption[];
  presets: RolePresetOption[];
}) {
  const [state, action] = useActionState(inviteMemberAction.bind(null, orgId), { ok: false });
  const [role, setRole] = useState(
    state.values?.["role"] ??
      roles.find((r) => r.value === "VIEWER")?.value ??
      roles.at(-1)?.value ??
      "",
  );
  const preset = presets.find((p) => p.role === role);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem] lg:grid-cols-[minmax(0,1fr)_14rem_auto] lg:items-start">
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="off"
          placeholder="name@company.com"
          required
          state={state}
        />
        <SelectField
          label="Role"
          name="role"
          state={state}
          options={roles}
          value={role}
          onChange={(event) => {
            setRole(event.currentTarget.value);
          }}
        />
        {/* Aligned with the fields, below their labels. */}
        <div className="sm:col-span-2 lg:col-span-1 lg:pt-7">
          <SubmitButton className="w-full lg:w-auto">Send invitation</SubmitButton>
        </div>
      </div>
      {presets.length > 0 ? (
        <div className="border-t border-line pt-5">
          <p id={`${orgId}-presets`} className="text-label text-ink-muted">
            Suggested for your stores
          </p>
          <div
            role="group"
            aria-labelledby={`${orgId}-presets`}
            className="mt-2.5 flex flex-wrap gap-2"
          >
            {presets.map((p) => (
              <button
                key={p.role}
                type="button"
                aria-pressed={role === p.role}
                onClick={() => {
                  setRole(p.role);
                }}
                className={cn(
                  "relative inline-flex h-8 items-center rounded-pill border px-3 text-label font-medium",
                  "transition-colors duration-(--duration-fast) ease-(--ease-standard)",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5",
                  role === p.role
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-line-strong bg-surface text-ink-muted hover:border-neutral-300 hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset ? (
            <p className="mt-3 flex items-start gap-2 text-body-sm text-ink-muted">
              <Icon icon={Info} size="sm" className="mt-0.5 text-ink-faint" />
              <span>
                <span className="font-medium text-ink">{preset.label}:</span> {preset.description}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export interface MemberInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  status: "ACTIVE" | "SUSPENDED";
  isCurrentUser: boolean;
  /** "All stores", "Acme Outlet and 1 more"… */
  access: string;
  /** Formatted on the server. */
  joined: string;
  canManage: boolean;
  canTransfer: boolean;
}

// Desktop (1280+): one aligned row per member under a column header. Below,
// each row stacks: who they are, then their role, access and actions.
const COLUMNS = "xl:grid xl:grid-cols-[minmax(0,1fr)_15rem_minmax(0,0.6fr)_11rem] xl:gap-x-6";

/**
 * The team, with a filter bar once the list is long (it filters the members
 * already on the page; nothing new is fetched).
 */
export function MembersList({
  orgId,
  members,
  roles,
}: {
  orgId: string;
  members: MemberInfo[];
  roles: RoleOption[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MemberStatusFilter>("all");
  const filterable = members.length >= MEMBER_FILTER_THRESHOLD;
  const shown = filterable ? filterMembers(members, query, status) : members;
  return (
    <>
      {filterable ? (
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
          <SearchInput
            aria-label="Filter members"
            placeholder="Filter by name, email or role"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
            className="sm:max-w-80 sm:flex-1"
          />
          <SegmentedControl
            aria-label="Member status"
            size="sm"
            value={status}
            onValueChange={(value) => {
              setStatus(value as MemberStatusFilter);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
          <p className="text-caption text-ink-faint sm:ml-auto" aria-live="polite">
            {shown.length === members.length
              ? `${String(members.length)} people`
              : `${String(shown.length)} of ${String(members.length)}`}
          </p>
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className={cn(
          "hidden h-10 items-center border-b border-line px-6 text-caption font-medium text-ink-faint",
          COLUMNS,
        )}
      >
        <span>Member</span>
        <span>Role</span>
        <span>Store access</span>
        <span />
      </div>
      {shown.length > 0 ? (
        <ul className="divide-y divide-line">
          {shown.map((member) => (
            <MemberRow key={member.id} orgId={orgId} member={member} roles={roles} />
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          titleAs="h3"
          illustration={<Illustration name="empty-search" size="sm" />}
          title="No members match"
          description="Try another name, email or role, or show every status."
        />
      )}
    </>
  );
}

function MemberRow({
  orgId,
  member,
  roles,
}: {
  orgId: string;
  member: MemberInfo;
  roles: RoleOption[];
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
  // The role picker offers Save only once it differs from the saved role.
  const [role, setRole] = useState(member.role);
  const [savedRole, setSavedRole] = useState(member.role);
  if (savedRole !== member.role) {
    setSavedRole(member.role);
    setRole(member.role);
  }
  const message = [roleState, statusState, transferState.ok ? transferState : null].find(
    (s) => s?.message,
  );
  const suspended = member.status === "SUSPENDED";

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6 xl:items-center",
        COLUMNS,
      )}
      data-testid="member-row"
      data-email={member.email}
    >
      <div className="flex min-w-0 basis-full items-center gap-3.5 xl:basis-auto">
        <Avatar name={member.name} size="lg" />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate text-body-sm font-semibold text-ink">{member.name}</span>
            {member.isCurrentUser ? (
              <Badge size="sm" tone="neutral">
                You
              </Badge>
            ) : null}
            {suspended ? (
              <Badge size="sm" variant="dot" tone="warning">
                Suspended
              </Badge>
            ) : null}
          </p>
          <p className="truncate text-body-sm text-ink-muted">{member.email}</p>
          <p className="text-caption text-ink-faint">Joined {member.joined}</p>
        </div>
      </div>

      {/* Role: a picker for members you may manage, otherwise the role itself. */}
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 pl-[3.375rem] xl:pl-0",
          // A picker gets the phone's full width; a role badge shares the line.
          member.canManage && "max-sm:basis-full",
        )}
      >
        {member.canManage ? (
          <form action={roleAction} className="flex min-w-0 flex-1 items-center gap-2">
            <label className="sr-only" htmlFor={`role-${member.id}`}>
              Role for {member.name}
            </label>
            <Select
              id={`role-${member.id}`}
              name="role"
              value={role}
              onChange={(event) => {
                setRole(event.currentTarget.value);
              }}
              className="h-9 min-w-0 flex-1 sm:w-44 sm:flex-none pointer-coarse:h-11"
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            {role !== member.role ? (
              <SubmitButton size="sm">
                Save<span className="sr-only"> role for {member.name}</span>
              </SubmitButton>
            ) : null}
          </form>
        ) : (
          <Badge tone={member.role === "OWNER" ? "brand" : "neutral"}>{member.roleLabel}</Badge>
        )}
      </div>

      <p
        className={cn(
          "flex min-w-0 items-center gap-2 text-body-sm text-ink-muted xl:pl-0",
          member.canManage && "max-sm:pl-[3.375rem]",
        )}
        title={member.access}
      >
        <Icon icon={Store} size="sm" className="text-ink-faint" />
        <span className="sr-only">Store access: </span>
        <span className="truncate">{member.access}</span>
      </p>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {member.canManage ? (
          <>
            <form action={statusAction}>
              <SubmitButton size="sm" variant="ghost">
                {suspended ? "Reactivate" : "Suspend"}
                <span className="sr-only"> {member.name}</span>
              </SubmitButton>
            </form>
            <ConfirmDialog
              title={`Remove ${member.name}?`}
              description="They lose access immediately. Anything they created stays."
              confirmLabel="Remove member"
              action={removeAction}
              state={removeState}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger-700 hover:bg-danger-50 hover:text-danger-700"
                >
                  Remove<span className="sr-only"> {member.name}</span>
                </Button>
              }
            />
          </>
        ) : null}
        {member.canTransfer ? (
          <ConfirmDialog
            tone="default"
            title={`Make ${member.name} the owner?`}
            description="You'll become an admin. Owners manage billing and can delete the organisation."
            confirmLabel="Transfer ownership"
            action={transferAction}
            state={transferState}
            trigger={
              <Button size="sm" variant="ghost">
                Transfer ownership
              </Button>
            }
          />
        ) : null}
      </div>

      {message?.message ? (
        <div className="basis-full xl:col-span-full">
          <FormMessage state={message} variant="inline" />
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
  invitation: { id: string; email: string; roleLabel: string; sent: string; expires: string };
  canManage: boolean;
}) {
  const [state, action] = useActionState(revokeInvitationAction.bind(null, orgId, invitation.id), {
    ok: false,
  });
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6"
      data-testid="invitation-row"
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-faint ring-1 ring-line ring-inset"
      >
        <Icon icon={Mail} size="sm" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold text-ink">{invitation.email}</p>
        <p className="text-caption text-ink-muted">
          {invitation.roleLabel} · Sent {invitation.sent} · {invitation.expires}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Badge size="sm" variant="dot" tone="info">
          Pending
        </Badge>
        {canManage ? (
          <form action={action}>
            <SubmitButton size="sm" variant="ghost">
              Revoke<span className="sr-only"> the invitation for {invitation.email}</span>
            </SubmitButton>
          </form>
        ) : null}
      </div>
      {state.message ? (
        <div className="basis-full">
          <FormMessage state={state} variant="inline" />
        </div>
      ) : null}
    </li>
  );
}
