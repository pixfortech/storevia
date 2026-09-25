import { buttonClasses } from "@storevia/ui";
import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLink, AuthPage } from "@/components/auth/auth-page";
import { dashboardAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Confirm email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const token = (await searchParams)["token"] ?? "";
  const result = token ? await dashboardAuth().verifyEmail(token, await headers()) : null;
  // Success continues on the sign-in page, which confirms it.
  if (result?.ok) redirect("/sign-in?verified=1");
  return (
    <AuthPage
      icon={Link2Off}
      iconTone="neutral"
      title="We couldn't confirm your email"
      description={<p role="alert">{result?.message ?? "This link is invalid or has expired."}</p>}
      footer={
        <>
          New here? <AuthLink href="/sign-up">Create an account</AuthLink>
        </>
      }
    >
      <p className="text-body-sm text-ink-muted">
        Confirmation links last 24 hours. Sign in and we'll send you a new one.
      </p>
      <Link href="/sign-in" className={buttonClasses("primary", "md", "mt-6 h-11 w-full")}>
        Go to sign in
      </Link>
    </AuthPage>
  );
}
