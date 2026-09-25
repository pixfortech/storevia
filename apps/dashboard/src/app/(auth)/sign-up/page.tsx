import { PASSWORD_MIN_LENGTH } from "@storevia/validation";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLink, AuthPage } from "@/components/auth/auth-page";
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
  const next = params["next"] ?? "";
  return (
    <AuthPage
      title="Create your account"
      description="Start with your account. You'll set up your business and first store next."
      footer={
        <>
          Already have an account?{" "}
          <AuthLink href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}>
            Sign in
          </AuthLink>
        </>
      }
    >
      <SignUpForm next={next} passwordMinLength={PASSWORD_MIN_LENGTH} />
    </AuthPage>
  );
}
