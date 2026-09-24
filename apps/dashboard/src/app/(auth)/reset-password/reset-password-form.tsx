"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, { ok: false });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField
        label="New password"
        name="password"
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
      <SubmitButton className="w-full">Update password</SubmitButton>
    </form>
  );
}
