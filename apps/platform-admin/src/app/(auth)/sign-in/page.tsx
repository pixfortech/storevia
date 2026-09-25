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
    <>
      <h1 className="font-display text-h3 text-ink">Staff sign in</h1>
      <p className="mt-1.5 text-body-sm text-ink-muted">
        Use your Storevia staff account to open platform administration.
      </p>
      <div className="mt-7">
        <SignInForm next={params["next"] ?? ""} />
      </div>
    </>
  );
}
