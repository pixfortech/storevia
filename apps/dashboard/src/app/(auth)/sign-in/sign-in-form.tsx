"use client";

import { useActionState } from "react";
import { AuthField, PasswordField, useFieldChecks } from "@/components/auth/fields";
import { AuthLink } from "@/components/auth/auth-page";
import { SIGN_IN_RULES } from "@/components/auth/validation";
import { AuthFormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/forms";
import { signInAction } from "../actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, { ok: false });
  const checks = useFieldChecks(SIGN_IN_RULES);
  return (
    <form action={action} {...checks.formProps} className="grid gap-5" noValidate>
      <AuthFormMessage state={state} hidden={checks.hasErrors} />
      <input type="hidden" name="next" value={next} />
      <AuthField
        label="Email"
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
        autoComplete="current-password"
        required
        error={checks.errors["password"]}
      />
      {/* After the field, not beside its label, so Tab goes from email to password. */}
      <p className="-mt-2 text-right text-body-sm">
        <AuthLink
          href="/forgot-password"
          // A 44 px tall hit area on touch screens, without moving anything.
          className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3"
        >
          Forgot password?
        </AuthLink>
      </p>
      <SubmitButton className="mt-1 h-11 w-full">Sign in</SubmitButton>
    </form>
  );
}
