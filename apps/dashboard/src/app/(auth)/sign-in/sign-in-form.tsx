"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { signInAction } from "../actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, { ok: false });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        state={state}
      />
      <div className="space-y-1.5">
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          state={state}
        />
        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      <SubmitButton className="w-full">Sign in</SubmitButton>
    </form>
  );
}
