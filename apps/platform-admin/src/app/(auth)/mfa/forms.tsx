"use client";

import { buttonClasses } from "@storevia/ui/button";
import Link from "next/link";
import { useActionState } from "react";
import { AuthFormMessage } from "@/components/auth/form-message";
import { SubmitButton, TextField } from "@/components/forms";
import { completeEnrolmentAction, verifyMfaAction, type EnrolState } from "./actions";

const CODE_PROPS = {
  inputMode: "numeric",
  autoComplete: "one-time-code",
  autoCapitalize: "off",
  spellCheck: false,
  required: true,
  maxLength: 32,
} as const;

/** Setup: the key to add to an authenticator app, then its first code. */
export function EnrolForm({ secret, uri, next }: { secret: string; uri: string; next: string }) {
  const [state, action] = useActionState<EnrolState, FormData>(completeEnrolmentAction, {
    ok: false,
  });
  if (state.ok && state.recoveryCodes) {
    return (
      <div className="grid gap-5">
        <AuthFormMessage state={state} />
        <p className="text-body-sm text-ink">
          Save these recovery codes somewhere safe, away from your phone. Each one signs you in once
          if you lose your authenticator. They won&apos;t be shown again.
        </p>
        <ul
          className="grid grid-cols-2 gap-2 rounded-card border border-line bg-subtle p-4 font-mono text-body-sm text-ink"
          data-testid="recovery-codes"
        >
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Link href={next || "/organisations"} className={buttonClasses("primary", "md")}>
          I&apos;ve saved them, continue
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-5" noValidate>
      <AuthFormMessage state={state} />
      <ol className="grid list-decimal gap-3 pl-5 text-body-sm text-ink">
        <li>
          Open an authenticator app (1Password, Google Authenticator, Authy…) and add an account
          with this setup key, or{" "}
          <a href={uri} className="font-medium underline">
            open it in your authenticator
          </a>
          .
          <code
            className="mt-2 block rounded-control border border-line bg-subtle px-3 py-2 font-mono text-body-sm break-all text-ink"
            data-testid="mfa-secret"
          >
            {secret}
          </code>
        </li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <TextField label="Code from your app" name="code" state={state} {...CODE_PROPS} />
      <SubmitButton>Turn on two-step verification</SubmitButton>
    </form>
  );
}

/** Sign-in's second step: a code from the app, or a recovery code. */
export function ChallengeForm({ next }: { next: string }) {
  const [state, action] = useActionState(verifyMfaAction, { ok: false });
  return (
    <form action={action} className="grid gap-5" noValidate>
      <AuthFormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Code from your app"
        name="code"
        state={state}
        hint="Lost your phone? Enter one of your recovery codes instead."
        {...CODE_PROPS}
      />
      <SubmitButton>Verify</SubmitButton>
    </form>
  );
}
