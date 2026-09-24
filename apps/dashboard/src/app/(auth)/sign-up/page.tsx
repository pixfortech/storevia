import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  if (await getSession()) redirect("/");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Create your Storevia account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Start with an account; you'll set up your business and store next.
        </p>
      </div>
      <SignUpForm next={params["next"] ?? ""} />
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link className="font-medium text-brand-700 hover:underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </div>
  );
}
