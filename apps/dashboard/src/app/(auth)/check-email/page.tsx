import type { Metadata } from "next";
import Link from "next/link";
import { ResendForm } from "./resend-form";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const email = params["email"] ?? "";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-ink-muted">
          We've sent a confirmation link
          {email ? (
            <>
              {" "}
              to <strong className="text-ink">{email}</strong>
            </>
          ) : null}
          . Open it to activate your account. The link expires in 24 hours.
        </p>
      </div>
      {email ? <ResendForm email={email} /> : null}
      <p className="text-center text-sm">
        <Link href="/sign-in" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
