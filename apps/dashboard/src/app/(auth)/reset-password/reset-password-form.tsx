"use client";

import { useActionState, useMemo } from "react";
import { PasswordField, useFieldChecks } from "@/components/auth/fields";
import { newPasswordRules } from "@/components/auth/validation";
import { AuthFormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/forms";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm({
  token,
  passwordMinLength,
}: {
  token: string;
  passwordMinLength: number;
}) {
  const [state, action] = useActionState(resetPasswordAction, { ok: false });
  const checks = useFieldChecks(
    useMemo(() => newPasswordRules(passwordMinLength), [passwordMinLength]),
  );
  const error = (name: string) => checks.errors[name] ?? state.fieldErrors?.[name];
  return (
    <form action={action} {...checks.formProps} className="grid gap-5" noValidate>
      <AuthFormMessage state={state} hidden={checks.hasErrors} />
      <input type="hidden" name="token" value={token} />
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        minLength={passwordMinLength}
        required
        hint={`At least ${String(passwordMinLength)} characters.`}
        error={error("password")}
      />
      <PasswordField
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        error={error("confirmPassword")}
      />
      <SubmitButton className="mt-1 h-11 w-full">Update password</SubmitButton>
    </form>
  );
}
