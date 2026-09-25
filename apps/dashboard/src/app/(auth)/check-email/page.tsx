import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import { AuthLink, AuthPage } from "@/components/auth/auth-page";
import { ResendForm } from "./resend-form";

export const metadata: Metadata = { title: "Check your email" };

// What happens after sign-up, so the wait for the email has a shape.
const NEXT_STEPS = [
  "Open the link in the email to confirm your address.",
  "Sign in with your email and password.",
  "Set up your business and your first store.",
] as const;

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const email = params["email"] ?? "";
  return (
    <AuthPage
      icon={MailCheck}
      title="Check your email"
      description={
        <>
          We've sent a confirmation link
          {email ? (
            <>
              {" "}
              to <strong className="font-medium wrap-break-word text-ink">{email}</strong>
            </>
          ) : null}
          . Open it to activate your account. The link expires in 24 hours.
        </>
      }
      footer={
        <>
          Already confirmed? <AuthLink href="/sign-in">Back to sign in</AuthLink>
        </>
      }
    >
      <ol className="grid gap-3" aria-label="Next steps">
        {NEXT_STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-3 text-body-sm text-ink-muted">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-surface text-caption font-medium text-ink tabular-nums"
            >
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {email ? (
        <div className="mt-8 grid gap-3">
          <p className="text-body-sm text-ink-muted">
            No email after a few minutes? Check spam, or:
          </p>
          <ResendForm email={email} />
        </div>
      ) : null}
    </AuthPage>
  );
}
