"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { acceptInvitationAction } from "./actions";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction.bind(null, token), { ok: false });
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        Accept invitation
      </SubmitButton>
    </form>
  );
}
