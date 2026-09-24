"use client";

import { Badge } from "@storevia/ui";
import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import {
  changePasswordAction,
  confirmPasswordAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "../actions";

interface SessionItem {
  id: string;
  current: boolean;
  device: string;
  ipAddress: string | null;
  lastActive: string;
}

function SessionRow({ session }: { session: SessionItem }) {
  const [state, action] = useActionState(revokeSessionAction.bind(null, session.id), { ok: false });
  return (
    <li
      className="flex flex-wrap items-center gap-3 px-5 py-4"
      data-testid="session-row"
      data-current={session.current}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{session.device}</p>
        <p className="text-xs text-ink-muted">
          {session.ipAddress ? `${session.ipAddress} · ` : ""}last active{" "}
          {new Date(session.lastActive).toLocaleString()}
        </p>
      </div>
      {session.current ? (
        <Badge tone="brand">This device</Badge>
      ) : (
        <form action={action}>
          <SubmitButton size="sm" variant="secondary">
            Sign out
          </SubmitButton>
        </form>
      )}
      {state.message ? <FormMessage state={state} /> : null}
    </li>
  );
}

export function SessionList({ sessions }: { sessions: SessionItem[] }) {
  const [state, action] = useActionState(revokeOtherSessionsAction, { ok: false });
  return (
    <>
      {state.message ? (
        <div className="border-b border-line px-5 py-3">
          <FormMessage state={state} />
        </div>
      ) : null}
      <ul className="divide-y divide-line">
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </ul>
      {sessions.length > 1 ? (
        <form action={action} className="border-t border-line px-5 py-4">
          <SubmitButton variant="secondary" size="sm">
            Sign out all other sessions
          </SubmitButton>
        </form>
      ) : null}
    </>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, { ok: false });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        state={state}
      />
      <TextField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        state={state}
        hint="At least 10 characters."
      />
      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        state={state}
      />
      <div className="flex justify-end">
        <SubmitButton>Change password</SubmitButton>
      </div>
    </form>
  );
}

export function ConfirmPasswordForm() {
  const [state, action] = useActionState(confirmPasswordAction, { ok: false });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        state={state}
      />
      <div className="flex justify-end">
        <SubmitButton variant="secondary">Confirm password</SubmitButton>
      </div>
    </form>
  );
}
