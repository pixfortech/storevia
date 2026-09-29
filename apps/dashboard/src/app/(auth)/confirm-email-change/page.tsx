import { buttonClasses } from "@storevia/ui/button";
import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLink, AuthPage } from "@/components/auth/auth-page";
import { dashboardAuth } from "@/lib/auth";
import { ConfirmEmailChangeForm } from "./confirm-email-change-form";

export const metadata: Metadata = { title: "Confirm new email" };

/**
 * Where the link sent to a NEW address lands (DB-4). Opening it changes
 * nothing (mail scanners open links too); the button does, once.
 */
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const token = (await searchParams)["token"] ?? "";
  const preview = token ? await dashboardAuth().previewEmailChange(token) : null;
  if (!preview) {
    return (
      <AuthPage
        icon={Link2Off}
        iconTone="neutral"
        title="This link can't be used"
        description="It may have expired (links last 1 hour), been used already, or been replaced by a newer request. Your email address hasn't changed."
        footer={
          <>
            Need help? <AuthLink href="/sign-in">Sign in</AuthLink> and start again from your
            profile.
          </>
        }
      >
        <Link href="/account/profile" className={buttonClasses("primary", "md", "h-11 w-full")}>
          Go to your profile
        </Link>
      </AuthPage>
    );
  }
  return <ConfirmEmailChangeForm token={token} email={preview.email} />;
}
