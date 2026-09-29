"use client";

import { Alert, CardBody, CardFooter } from "@storevia/ui/surfaces";
import { MailCheck } from "lucide-react";
import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { cancelEmailChangeAction, requestEmailChangeAction, updateNameAction } from "../actions";

export function NameForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateNameAction, { ok: false });
  return (
    <form action={action} noValidate>
      <CardBody className="py-6">
        <TextField
          label="Your name"
          name="name"
          defaultValue={name}
          autoComplete="name"
          maxLength={100}
          required
          state={state}
          hint="Up to 100 characters."
          className="sm:max-w-sm"
        />
      </CardBody>
      <CardFooter className="justify-between">
        <FormMessage state={state} variant="inline" />
        <SubmitButton className="ml-auto">Save name</SubmitButton>
      </CardFooter>
    </form>
  );
}

/**
 * Asks for the new address and the password (the step-up). While a change
 * waits for confirmation, says so plainly: which address the link went to,
 * and that the current one stays until then.
 */
export function EmailChangeForm({
  currentEmail,
  pending,
}: {
  currentEmail: string;
  pending: { email: string; minutesLeft: number } | null;
}) {
  const [state, action] = useActionState(requestEmailChangeAction, { ok: false });
  const [cancelState, cancelAction] = useActionState(cancelEmailChangeAction, { ok: false });
  return (
    <>
      {pending ? (
        <CardBody className="pt-6 pb-0">
          <Alert
            tone="info"
            icon={MailCheck}
            title="Waiting for you to confirm"
            data-testid="pending-email-change"
            actions={
              <form action={cancelAction}>
                <SubmitButton size="sm" variant="secondary">
                  Cancel change
                </SubmitButton>
              </form>
            }
          >
            We sent a link to <strong className="font-semibold text-ink">{pending.email}</strong>;
            your email stays <strong className="font-semibold text-ink">{currentEmail}</strong>{" "}
            until you confirm. The link works once and expires in{" "}
            {pending.minutesLeft === 1 ? "1 minute" : `${String(pending.minutesLeft)} minutes`}.
          </Alert>
        </CardBody>
      ) : cancelState.message ? (
        <CardBody className="pt-6 pb-0">
          <FormMessage state={cancelState} />
        </CardBody>
      ) : null}
      <form action={action} noValidate>
        <CardBody className="space-y-5 py-6">
          <p className="text-body-sm text-ink-muted">
            Current address: <span className="font-medium text-ink">{currentEmail}</span>
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="New email address"
              name="newEmail"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              state={state}
            />
            <TextField
              label="Your password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              state={state}
              hint="To confirm it's you."
            />
          </div>
        </CardBody>
        <CardFooter className="justify-between">
          {/* Success shows as the pending notice above. */}
          {state.ok ? null : <FormMessage state={state} variant="inline" />}
          <SubmitButton className="ml-auto">
            {pending ? "Send a new link" : "Send confirmation link"}
          </SubmitButton>
        </CardFooter>
      </form>
    </>
  );
}
