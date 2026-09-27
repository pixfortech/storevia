"use client";

import { Button } from "@storevia/ui/button";
import { CardBody, CardFooter } from "@storevia/ui/surfaces";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  connectRazorpayAction,
  connectTestPaymentsAction,
  setPaymentConnectionActiveAction,
} from "@/app/(app)/s/[storeId]/settings/payments/actions";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";

// Payment provider forms. Secrets are write-only: the inputs start empty,
// the browser is asked not to fill or remember them, and the action never
// echoes them back.

export function ConnectTestPaymentsForm({ storeId }: { storeId: string }) {
  const [state, action] = useActionState(connectTestPaymentsAction.bind(null, storeId), {
    ok: false,
  });
  return (
    <form action={action}>
      <CardFooter className="justify-between">
        <FormMessage state={state} variant="inline" />
        <SubmitButton variant="secondary" className="ml-auto">
          Connect test payments
        </SubmitButton>
      </CardFooter>
    </form>
  );
}

export function RazorpayConnectForm({
  storeId,
  connected,
}: {
  storeId: string;
  /** A Razorpay connection exists: this form replaces its keys (per mode). */
  connected: boolean;
}) {
  const [state, action] = useActionState(connectRazorpayAction.bind(null, storeId), {
    ok: false,
  });
  return (
    <form action={action} noValidate autoComplete="off">
      <CardBody className="space-y-5 py-6">
        {!state.ok ? <FormMessage state={state} /> : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Key ID"
            name="keyId"
            required
            state={state}
            placeholder="rzp_live_…"
            autoComplete="off"
            spellCheck={false}
            hint="Starts with rzp_test_ (test mode) or rzp_live_ (live mode)."
          />
          <TextField
            label="Key secret"
            name="keySecret"
            type="password"
            required
            state={state}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
        <TextField
          label="Webhook secret"
          name="webhookSecret"
          type="password"
          required
          state={state}
          autoComplete="new-password"
          spellCheck={false}
          hint="A long random string you choose. Enter the same secret when you create the webhook in Razorpay."
        />
        <TextField
          label="Razorpay account ID"
          name="accountId"
          state={state}
          placeholder="acc_…"
          autoComplete="off"
          spellCheck={false}
          hint="Optional. When set, webhooks from any other Razorpay account are refused."
        />
      </CardBody>
      <CardFooter className="justify-between">
        {state.ok ? <FormMessage state={state} variant="inline" /> : null}
        <SubmitButton className="ml-auto">
          {connected ? "Update Razorpay keys" : "Connect Razorpay"}
        </SubmitButton>
      </CardFooter>
    </form>
  );
}

export function ConnectionActiveButton({
  storeId,
  connectionId,
  label,
  active,
  disabled = false,
}: {
  storeId: string;
  connectionId: string;
  label: string;
  active: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        size="sm"
        variant={active ? "secondary" : "primary"}
        pending={pending}
        disabled={disabled}
        onClick={() => {
          startTransition(async () => {
            const result = await setPaymentConnectionActiveAction(storeId, connectionId, !active);
            setError(result.ok ? null : (result.message ?? "That didn't work."));
            router.refresh();
          });
        }}
      >
        {active ? "Disable" : "Enable"}
        <span className="sr-only"> {label}</span>
      </Button>
      {error ? (
        <p role="alert" className="max-w-sm text-body-sm text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
