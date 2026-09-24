import { buttonClasses, Card, CardBody, CardHeader } from "@storevia/ui";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@storevia/ui";
import { dashboardAuth, getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOutAction } from "../actions";
import { ChangePasswordForm, ConfirmPasswordForm, SessionList } from "./security-forms";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/account/security");
  const sessions = await dashboardAuth().listSessions(session);
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center gap-4 border-b border-line bg-surface px-4 sm:px-6">
        <Link href="/" className={buttonClasses("ghost", "sm")}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </Link>
        <Logo />
        <form action={signOutAction} className="ml-auto">
          <button type="submit" className={buttonClasses("ghost", "sm")}>
            Sign out
          </button>
        </form>
      </header>
      <main id="main" className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account security</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {session.name} · {session.email}
          </p>
        </div>
        <Card>
          <CardHeader
            title="Signed-in devices"
            description="Sign out any session you don't recognise."
          />
          <SessionList
            sessions={sessions.map((s) => ({
              id: s.id,
              current: s.current,
              device: s.userAgent ?? "Unknown device",
              ipAddress: s.ipAddress ?? null,
              lastActive: s.lastActiveAt.toISOString(),
            }))}
          />
        </Card>
        <Card>
          <CardHeader
            title="Change password"
            description="Other sessions are signed out when you change it."
          />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>
        <Card id="confirm">
          <CardHeader
            title="Confirm it's you"
            description="Some actions, such as transferring ownership, need a recent password confirmation."
          />
          <CardBody>
            <ConfirmPasswordForm />
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
