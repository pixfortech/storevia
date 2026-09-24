"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { confirmPasswordAction } from "./actions";

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
      <SubmitButton>Confirm password</SubmitButton>
    </form>
  );
}
