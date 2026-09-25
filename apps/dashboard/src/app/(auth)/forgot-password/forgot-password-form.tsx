"use client";

import { Button } from "@storevia/ui/button";
import { MailCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { AuthField, useFieldChecks } from "@/components/auth/fields";
import { AuthFormMessage } from "@/components/auth/form-message";
import { AuthLink, AuthPage } from "@/components/auth/auth-page";
import { EMAIL_RULES } from "@/components/auth/validation";
import { SubmitButton } from "@/components/forms";
import { forgotPasswordAction } from "../actions";

const FOOTER = (
  <>
    Remembered it? <AuthLink href="/sign-in">Back to sign in</AuthLink>
  </>
);

/**
 * The whole forgot-password screen: the request form, then a sent view that
 * owns the page (its own heading) instead of an alert under the request copy.
 */
export function ForgotPassword() {
  const [state, action] = useActionState(forgotPasswordAction, { ok: false });
  const checks = useFieldChecks(EMAIL_RULES);
  // The state that "Use a different email" dismissed; a new submit replaces it.
  const [dismissed, setDismissed] = useState<typeof state | null>(null);
  const sent = state.ok && state !== dismissed;

  // The form, and the focused submit button with it, is replaced by the sent
  // view (and back): move focus to the new view's start rather than <body>.
  const heading = useRef<HTMLHeadingElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const wasSent = useRef(sent);
  useEffect(() => {
    if (wasSent.current === sent) return;
    wasSent.current = sent;
    if (sent) heading.current?.focus();
    else email.current?.focus();
  }, [sent]);

  if (sent) {
    return (
      <AuthPage
        key="sent"
        icon={MailCheck}
        title="Check your inbox"
        headingRef={heading}
        description={state.message}
        footer={FOOTER}
      >
        <p className="text-body-sm text-ink-muted">
          The link lasts 30 minutes and works once. Nothing after a few minutes? Check your spam
          folder.
        </p>
        <Button
          variant="secondary"
          className="mt-6 h-11 w-full"
          onClick={() => {
            setDismissed(state);
          }}
        >
          Use a different email
        </Button>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      key="form"
      title="Reset your password"
      description="Enter the email you use for Storevia and we'll send you a link to choose a new password."
      footer={FOOTER}
    >
      <form action={action} {...checks.formProps} className="grid gap-5" noValidate>
        <AuthFormMessage state={state} hidden={checks.hasErrors || state.ok} />
        <AuthField
          ref={email}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={checks.errors["email"]}
          defaultValue={state.values?.["email"]}
        />
        <SubmitButton className="mt-1 h-11 w-full">Send reset link</SubmitButton>
      </form>
    </AuthPage>
  );
}
