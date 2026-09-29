"use client";

import { buttonClasses } from "@storevia/ui/button";
import { Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { AuthPage } from "@/components/auth/auth-page";
import { AuthFormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/forms";
import { confirmEmailChangeAction } from "../actions";

export function ConfirmEmailChangeForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(confirmEmailChangeAction, { ok: false });
  const heading = useRef<HTMLHeadingElement>(null);

  // The result replaces the question: move focus to its heading.
  useEffect(() => {
    if (state.ok) heading.current?.focus();
  }, [state.ok]);

  if (state.ok) {
    return (
      <AuthPage
        icon={MailCheck}
        title="Your email address has changed"
        headingRef={heading}
        description={
          <p role="status">
            You now sign in with <strong className="font-semibold text-ink">{email}</strong>.
            We&apos;ve let your previous address know, and your other sessions were signed out.
          </p>
        }
      >
        <Link href="/" className={buttonClasses("primary", "md", "h-11 w-full")}>
          Continue to Storevia
        </Link>
      </AuthPage>
    );
  }
  return (
    <AuthPage
      icon={Mail}
      title="Confirm your new email"
      description={
        <p>
          From now on you&apos;ll sign in to Storevia with{" "}
          <strong className="font-semibold text-ink">{email}</strong>. Your other sessions will be
          signed out.
        </p>
      }
    >
      <form action={action} className="grid gap-5">
        <AuthFormMessage state={state} />
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="h-11 w-full">Confirm new email</SubmitButton>
      </form>
    </AuthPage>
  );
}
