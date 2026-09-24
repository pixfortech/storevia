"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { forgotPasswordAction } from "../actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, { ok: false });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        state={state}
      />
      <SubmitButton className="w-full">Send reset link</SubmitButton>
    </form>
  );
}
