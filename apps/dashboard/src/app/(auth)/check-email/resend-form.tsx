"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { resendVerificationAction } from "../actions";

export function ResendForm({ email }: { email: string }) {
  const [state, action] = useActionState(resendVerificationAction, { ok: false });
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="email" value={email} />
      <SubmitButton variant="secondary" className="w-full">
        Resend the link
      </SubmitButton>
    </form>
  );
}
