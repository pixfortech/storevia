"use client";

import { Badge, Button, CardBody, CardFooter, Icon } from "@storevia/ui";
import { ChevronDown, Monitor, MonitorSmartphone, Smartphone, Tablet } from "lucide-react";
import { useActionState, useState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import type { DeviceKind } from "@/lib/areas/user-agent";
import {
  changePasswordAction,
  confirmPasswordAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "../actions";

interface SessionItem {
  id: string;
  current: boolean;
  /** Readable name, e.g. "Chrome on macOS". */
  device: string;
  kind: DeviceKind;
  /** The raw header, shown on hover for anyone who wants the detail. */
  userAgent: string | null;
  ipAddress: string | null;
  /** Formatted on the server, e.g. "5 minutes ago". */
  lastActive: string;
}

const DEVICE_ICON = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: MonitorSmartphone,
} as const;

function SessionRow({ session }: { session: SessionItem }) {
  const [state, action] = useActionState(revokeSessionAction.bind(null, session.id), { ok: false });
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6"
      data-testid="session-row"
      data-current={session.current}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-control bg-subtle text-ink-muted ring-1 ring-line ring-inset"
      >
        <Icon icon={DEVICE_ICON[session.kind]} size="md" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span
            className="truncate text-body-sm font-semibold text-ink"
            title={session.userAgent ?? undefined}
          >
            {session.device}
          </span>
          {session.current ? (
            <Badge size="sm" variant="dot" tone="success">
              This device
            </Badge>
          ) : null}
        </p>
        <p className="mt-0.5 text-caption text-ink-muted">
          {session.ipAddress ? `${session.ipAddress} · ` : ""}Last active {session.lastActive}
        </p>
      </div>
      {session.current ? null : (
        <form action={action} className="ml-auto">
          <SubmitButton size="sm" variant="secondary">
            Sign out<span className="sr-only"> {session.device}</span>
          </SubmitButton>
        </form>
      )}
      {state.message ? (
        <div className="basis-full">
          <FormMessage state={state} variant="inline" />
        </div>
      ) : null}
    </li>
  );
}

// A long list (many browsers, or automation) opens with the first few.
const COLLAPSED = 5;

/** Sessions, this device first (the page orders them). */
export function SessionList({ sessions }: { sessions: SessionItem[] }) {
  const [state, action] = useActionState(revokeOtherSessionsAction, { ok: false });
  const [expanded, setExpanded] = useState(false);
  const others = sessions.filter((s) => !s.current).length;
  const hidden = expanded ? 0 : Math.max(0, sessions.length - COLLAPSED);
  return (
    <>
      <ul className="divide-y divide-line">
        {(hidden > 0 ? sessions.slice(0, COLLAPSED) : sessions).map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </ul>
      {hidden > 0 ? (
        <div className="border-t border-line px-3 py-2 sm:px-4">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            trailingIcon={ChevronDown}
            className="text-brand-700 hover:text-brand-800"
            onClick={() => {
              setExpanded(true);
            }}
          >
            Show {hidden} more {hidden === 1 ? "session" : "sessions"}
          </Button>
        </div>
      ) : null}
      {sessions.length > 1 || state.message ? (
        <CardFooter className="justify-between">
          <FormMessage state={state} variant="inline" />
          {sessions.length > 1 ? (
            <form action={action} className="ml-auto">
              <SubmitButton variant="secondary" size="sm">
                Sign out all other sessions
              </SubmitButton>
            </form>
          ) : null}
        </CardFooter>
      ) : null}
      {others === 0 && !state.message ? (
        <p className="border-t border-line px-5 py-3.5 text-caption text-ink-faint sm:px-6">
          You&apos;re signed in on this device only.
        </p>
      ) : null}
    </>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, { ok: false });
  return (
    <form action={action} noValidate>
      <CardBody className="space-y-5 py-6">
        <TextField
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          state={state}
        />
        <div className="grid gap-5 sm:grid-cols-2">
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
        </div>
      </CardBody>
      <CardFooter className="justify-between">
        <FormMessage state={state} variant="inline" />
        <SubmitButton className="ml-auto">Change password</SubmitButton>
      </CardFooter>
    </form>
  );
}

export function ConfirmPasswordForm() {
  const [state, action] = useActionState(confirmPasswordAction, { ok: false });
  return (
    <form action={action} noValidate>
      <CardBody className="py-6">
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          state={state}
          className="sm:max-w-sm"
        />
      </CardBody>
      <CardFooter className="justify-between">
        <FormMessage state={state} variant="inline" />
        <SubmitButton variant="secondary" className="ml-auto">
          Confirm password
        </SubmitButton>
      </CardFooter>
    </form>
  );
}
