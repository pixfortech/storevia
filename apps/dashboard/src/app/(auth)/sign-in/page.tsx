import { Alert } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLink, AuthPage } from "@/components/auth/auth-page";
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
  const next = params["next"] ?? "";
  return (
    <AuthPage
      title="Sign in to Storevia"
      description="Welcome back. Enter your details to continue."
      footer={
        <>
          New to Storevia?{" "}
          <AuthLink href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"}>
            Create an account
          </AuthLink>
        </>
      }
    >
      {params["reset"] ? (
        <Alert tone="success" title="Password updated" className="mb-6">
          Your password was reset. Sign in with your new password.
        </Alert>
      ) : null}
      {params["verified"] ? (
        <Alert tone="success" title="Email confirmed" className="mb-6">
          Your email is confirmed. You can sign in now.
        </Alert>
      ) : null}
      <SignInForm next={next} />
    </AuthPage>
  );
}
