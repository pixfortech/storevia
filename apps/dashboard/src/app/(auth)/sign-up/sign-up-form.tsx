"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { signUpAction } from "../actions";

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUpAction, { ok: false });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField label="Your name" name="name" autoComplete="name" required state={state} />
      <TextField
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        required
        state={state}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        hint="At least 10 characters. A short phrase is easy to remember."
        state={state}
      />
      <SubmitButton className="w-full">Create account</SubmitButton>
    </form>
  );
}
