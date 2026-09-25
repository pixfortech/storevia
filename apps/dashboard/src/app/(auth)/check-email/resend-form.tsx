"use client";

import { useActionState } from "react";
import { AuthFormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/forms";
import { resendVerificationAction } from "../actions";

export function ResendForm({ email }: { email: string }) {
  const [state, action] = useActionState(resendVerificationAction, { ok: false });
  return (
    <form action={action} className="grid gap-4">
      <AuthFormMessage state={state} />
      <input type="hidden" name="email" value={email} />
      <SubmitButton variant="secondary" className="h-11 w-full">
        Resend the link
      </SubmitButton>
    </form>
  );
}
