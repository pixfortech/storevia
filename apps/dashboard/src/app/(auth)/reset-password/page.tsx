import { buttonClasses } from "@storevia/ui/button";
import { PASSWORD_MIN_LENGTH } from "@storevia/validation";
import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLink, AuthPage } from "@/components/auth/auth-page";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = params["token"] ?? "";
  // The emailed link lands here with ?token=…, or with ?error=… when the
  // auth server has already rejected it (expired or used).
  if (!token || params["error"]) {
    return (
      <AuthPage
        icon={Link2Off}
        iconTone="neutral"
        title="This reset link can't be used"
        description="It may have expired (links last 30 minutes), been used already, or been copied incompletely. Request a new one to continue."
        footer={
          <>
            Know your password? <AuthLink href="/sign-in">Back to sign in</AuthLink>
          </>
        }
      >
        <Link href="/forgot-password" className={buttonClasses("primary", "md", "h-11 w-full")}>
          Request a new link
        </Link>
      </AuthPage>
    );
  }
  return (
    <AuthPage
      title="Choose a new password"
      description="Updating it signs you out of Storevia on every device, so you'll sign in again with the new one."
      footer={
        <>
          Link not working? <AuthLink href="/forgot-password">Request a new one</AuthLink>
        </>
      }
    >
      <ResetPasswordForm token={token} passwordMinLength={PASSWORD_MIN_LENGTH} />
    </AuthPage>
  );
}
