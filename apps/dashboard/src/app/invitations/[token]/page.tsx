import { previewInvitation, ROLE_LABELS } from "@storevia/tenancy";
import { Alert, buttonClasses } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@storevia/ui";
import { getPrincipal } from "@/lib/auth";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, principal] = await Promise.all([previewInvitation(token), getPrincipal()]);
  const returnTo = encodeURIComponent(`/invitations/${token}`);
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <Logo className="mb-8 text-lg" />
      <div className="w-full max-w-[440px] space-y-5 rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        {!invitation?.usable ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Invitation unavailable</h1>
            <Alert tone="warning">
              This invitation is invalid, has expired or has already been used. Ask for a new one.
            </Alert>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Join {invitation.organisationName}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                You've been invited as{" "}
                <strong className="text-ink">{ROLE_LABELS[invitation.role]}</strong>.
              </p>
            </div>
            {!principal ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  Sign in or create an account with the invited email address to accept.
                </p>
                <Link
                  href={`/sign-in?next=${returnTo}`}
                  className={buttonClasses("primary", "md", "w-full")}
                >
                  Sign in to accept
                </Link>
                <Link
                  href={`/sign-up?next=${returnTo}`}
                  className={buttonClasses("secondary", "md", "w-full")}
                >
                  Create an account
                </Link>
              </div>
            ) : principal.email.toLowerCase() !== invitation.email.toLowerCase() ? (
              <Alert tone="warning" title="Different account">
                This invitation is for another email address. Sign in with that address to accept
                it.
              </Alert>
            ) : (
              <AcceptInvitationForm token={token} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
