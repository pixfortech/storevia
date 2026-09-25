"use client";

import { buttonClasses } from "@storevia/ui/button";
import { Icon } from "@storevia/ui/icons";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { PasswordField } from "@/components/auth/fields";
import { FormMessage, SubmitButton } from "@/components/forms";
import { confirmPasswordAction } from "./actions";

/**
 * Step-up confirmation. The same password field as sign-in (44 px, show and
 * hide); `returnTo` is an already-validated organisation page to go back to.
 */
export function ConfirmPasswordForm({ returnTo }: { returnTo: string | null }) {
  const [state, action] = useActionState(confirmPasswordAction, { ok: false });
  const router = useRouter();
  // Re-render the server parts (the "Confirmed recently" badge, the staff
  // menu) once the session is stamped.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.["password"]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant={state.ok && returnTo ? "secondary" : "primary"}>
          Confirm password
        </SubmitButton>
        {returnTo ? (
          <Link
            href={returnTo}
            className={buttonClasses(state.ok ? "primary" : "ghost", "md", "pointer-coarse:h-11")}
          >
            <Icon icon={ArrowLeft} size="sm" />
            Back to the organisation
          </Link>
        ) : null}
      </div>
    </form>
  );
}
