import type { Metadata } from "next";
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
  if (await getSession()) redirect("/organisations");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Use your Storevia staff account.</p>
      </div>
      <SignInForm next={params["next"] ?? ""} />
    </div>
  );
}
