import { Alert } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  if (await getSession()) redirect("/");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Storevia</h1>
        <p className="mt-1 text-sm text-ink-muted">Welcome back. Enter your details to continue.</p>
      </div>
      {params["reset"] ? (
        <Alert tone="success">Your password was reset. Sign in with your new password.</Alert>
      ) : null}
      {params["verified"] ? (
        <Alert tone="success">Your email is confirmed. You can sign in now.</Alert>
      ) : null}
      <SignInForm next={params["next"] ?? ""} />
      <p className="text-center text-sm text-ink-muted">
        New to Storevia?{" "}
        <Link
          className="font-medium text-brand-700 hover:underline"
          href={params["next"] ? `/sign-up?next=${encodeURIComponent(params["next"])}` : "/sign-up"}
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
