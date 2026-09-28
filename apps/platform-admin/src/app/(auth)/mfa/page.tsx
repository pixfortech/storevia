import { safeRedirectPath } from "@storevia/security";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, platformAuth } from "@/lib/auth";
import { ChallengeForm, EnrolForm } from "./forms";

export const metadata: Metadata = { title: "Two-step verification" };
export const dynamic = "force-dynamic";

// Platform staff MFA (M8, ADR-0035): every staff sign-in completes a second
// factor here before any admin page opens. First time: set up an
// authenticator (mandatory). After that: a code, or a recovery code.

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const next = safeRedirectPath((await searchParams)["next"] ?? "", "/organisations");
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (session.mfaVerifiedAt) redirect(next);
  const auth = platformAuth();
  const { enrolled } = await auth.mfaStatus(session);
  if (!enrolled) {
    const started = await auth.startMfaEnrolment(session);
    if (!started.ok) redirect("/sign-in");
    return (
      <>
        <h1 className="font-display text-h3 text-ink">Set up two-step verification</h1>
        <p className="mt-1.5 text-body-sm text-ink-muted">
          Platform administration needs a second step at every sign-in.
        </p>
        <div className="mt-7">
          <EnrolForm secret={started.value.secret} uri={started.value.uri} next={next} />
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-h3 text-ink">Two-step verification</h1>
      <p className="mt-1.5 text-body-sm text-ink-muted">
        Enter the code from your authenticator app to continue.
      </p>
      <div className="mt-7">
        <ChallengeForm next={next} />
      </div>
    </>
  );
}
