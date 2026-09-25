import { Icon } from "@storevia/ui/icons";
import { Avatar } from "@storevia/ui/surfaces";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsLayout, SettingsSection } from "@/components/areas/settings";
import { SignOutButton, StandaloneHeader } from "@/components/areas/standalone";
import { describeUserAgent } from "@/lib/areas/user-agent";
import { relativeTime } from "@/lib/dashboard/activity";
import { dashboardAuth, getSession } from "@/lib/auth";
import { ChangePasswordForm, ConfirmPasswordForm, SessionList } from "./security-forms";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/account/security");
  const sessions = await dashboardAuth().listSessions(session);
  const now = new Date();
  return (
    <div className="flex min-h-dvh flex-col">
      <StandaloneHeader>
        <Link
          href="/"
          className="inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-body-sm font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:h-11"
        >
          <Icon icon={ArrowLeft} size="sm" />
          <span>
            Back<span className="max-sm:hidden"> to dashboard</span>
          </span>
        </Link>
        <SignOutButton />
      </StandaloneHeader>
      <main
        id="main"
        // The settings column (48 rem), plus the side index from 1280 px, centred.
        className="mx-auto w-full max-w-[52rem] flex-1 px-4 pt-8 pb-16 sm:px-6 lg:px-8 lg:pt-12 xl:max-w-[68.5rem] xl:px-10"
      >
        <header className="mb-8 flex items-center gap-4 lg:mb-10">
          <Avatar name={session.name} size="xl" />
          <div className="min-w-0">
            <p className="text-overline text-ink-faint uppercase">Your account</p>
            <h1 className="mt-1 font-display text-h3 text-ink md:text-h2">Account security</h1>
            <p className="mt-1 truncate text-body-sm text-ink-muted">
              {session.name} · {session.email}
            </p>
          </div>
        </header>
        <SettingsLayout
          sections={[
            { id: "sessions", label: "Signed-in devices" },
            { id: "password", label: "Password" },
            { id: "confirm", label: "Confirm it's you" },
          ]}
        >
          <SettingsSection
            id="sessions"
            title="Signed-in devices"
            description="Where your account is signed in. Sign out any session you don't recognise."
          >
            <SessionList
              // This device first; the rest keep their order.
              sessions={[...sessions]
                .sort((a, b) => Number(b.current) - Number(a.current))
                .map((s) => {
                  const device = describeUserAgent(s.userAgent);
                  return {
                    id: s.id,
                    current: s.current,
                    device: device.label,
                    kind: device.kind,
                    userAgent: s.userAgent ?? null,
                    ipAddress: s.ipAddress ?? null,
                    lastActive: relativeTime(s.lastActiveAt, now),
                  };
                })}
            />
          </SettingsSection>
          <SettingsSection
            id="password"
            title="Change password"
            description="Your other sessions are signed out when you change it."
          >
            <ChangePasswordForm />
          </SettingsSection>
          <SettingsSection
            id="confirm"
            title="Confirm it's you"
            description="Some actions, such as granting the Admin role or transferring ownership, need a recent password confirmation."
          >
            <ConfirmPasswordForm />
          </SettingsSection>
        </SettingsLayout>
      </main>
    </div>
  );
}
