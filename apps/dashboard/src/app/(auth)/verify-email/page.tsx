import { Alert, buttonClasses } from "@storevia/ui";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Confirm email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const token = (await searchParams)["token"] ?? "";
  const result = token ? await dashboardAuth().verifyEmail(token, await headers()) : null;
  if (result?.ok) redirect("/sign-in?verified=1");
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Confirm your email</h1>
      <Alert tone="danger">{result?.message ?? "This link is invalid or has expired."}</Alert>
      <p className="text-sm text-ink-muted">Sign in to receive a new confirmation link.</p>
      <Link href="/sign-in" className={buttonClasses("secondary", "md", "w-full")}>
        Go to sign in
      </Link>
    </div>
  );
}
