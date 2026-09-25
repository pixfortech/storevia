"use client";

import { useActionState, useMemo } from "react";
import { AuthField, PasswordField, useFieldChecks } from "@/components/auth/fields";
import { signUpRules } from "@/components/auth/validation";
import { AuthFormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/forms";
import { signUpAction } from "../actions";

export function SignUpForm({
  next,
  passwordMinLength,
}: {
  next: string;
  passwordMinLength: number;
}) {
  const [state, action] = useActionState(signUpAction, { ok: false });
  const checks = useFieldChecks(useMemo(() => signUpRules(passwordMinLength), [passwordMinLength]));
  return (
    <form action={action} {...checks.formProps} className="grid gap-5" noValidate>
      <AuthFormMessage state={state} hidden={checks.hasErrors} />
      <input type="hidden" name="next" value={next} />
      <AuthField
        label="Your name"
        name="name"
        autoComplete="name"
        required
        error={checks.errors["name"]}
        defaultValue={state.values?.["name"]}
      />
      <AuthField
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={checks.errors["email"]}
        defaultValue={state.values?.["email"]}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        minLength={passwordMinLength}
        required
        hint={`At least ${String(passwordMinLength)} characters. A short phrase is easy to remember.`}
        error={checks.errors["password"]}
      />
      <SubmitButton className="mt-1 h-11 w-full">Create account</SubmitButton>
    </form>
  );
}
