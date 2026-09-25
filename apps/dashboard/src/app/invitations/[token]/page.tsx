import { previewInvitation, ROLE_LABELS } from "@storevia/tenancy";
import { Alert, Avatar, buttonClasses, Illustration } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StandaloneHeader } from "@/components/areas/standalone";
import { getPrincipal } from "@/lib/auth";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitation" };

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StandaloneHeader />
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 sm:items-center sm:px-8 sm:pb-24"
      >
        <div className="w-full max-w-md rounded-panel border border-line bg-surface p-6 shadow-card sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, principal] = await Promise.all([previewInvitation(token), getPrincipal()]);
  const returnTo = encodeURIComponent(`/invitations/${token}`);

  if (!invitation?.usable) {
    return (
      <Frame>
        <div className="flex flex-col items-center text-center">
          <Illustration name="error" size="sm" />
          <h1 className="mt-1 font-display text-h4 text-ink">Invitation unavailable</h1>
          <p className="mt-2 text-body-sm text-ink-muted">
            This invitation is invalid, has expired or has already been used. Ask for a new one.
          </p>
          <Link href="/" className={buttonClasses("secondary", "md", "mt-6")}>
            Go to Storevia
          </Link>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex flex-col items-center text-center">
        <Avatar name={invitation.organisationName} shape="square" size="xl" />
        <p className="mt-5 text-overline text-ink-faint uppercase">You&apos;re invited</p>
        <h1 className="mt-2 font-display text-h3 text-ink">Join {invitation.organisationName}</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          You&apos;ve been invited as{" "}
          <strong className="font-semibold text-ink">{ROLE_LABELS[invitation.role]}</strong>. Your
          role decides what you can see and do there.
        </p>
      </div>
      <div className="mt-7 border-t border-line pt-6">
        {!principal ? (
          <div className="space-y-3">
            <p className="text-center text-body-sm text-ink-muted">
              Sign in or create an account with the invited email address to accept.
            </p>
            <Link
              href={`/sign-in?next=${returnTo}`}
              className={buttonClasses("primary", "lg", "w-full")}
            >
              Sign in to accept
            </Link>
            <Link
              href={`/sign-up?next=${returnTo}`}
              className={buttonClasses("secondary", "lg", "w-full")}
            >
              Create an account
            </Link>
          </div>
        ) : principal.email.toLowerCase() !== invitation.email.toLowerCase() ? (
          <Alert tone="warning" title="Different account">
            This invitation is for another email address. Sign in with that address to accept it.
          </Alert>
        ) : (
          <AcceptInvitationForm token={token} />
        )}
      </div>
    </Frame>
  );
}
