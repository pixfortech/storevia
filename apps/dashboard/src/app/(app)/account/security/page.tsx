import { Avatar } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountHeaderBar, AccountTabs } from "@/components/areas/account";
import { SettingsLayout, SettingsSection } from "@/components/areas/settings";
import { describeUserAgent } from "@/lib/areas/user-agent";
import { relativeTime } from "@/lib/dashboard/activity";
import { dashboardAuth, getSession, toPrincipal } from "@/lib/auth";
import { formatLongDate } from "@/lib/areas/dates";
import { listPendingDeletions } from "@storevia/tenancy";
import { toTypeId } from "@storevia/types";
import {
  ChangePasswordForm,
  ConfirmPasswordForm,
  DeleteAccountForm,
  PendingDeletionRow,
  SessionList,
} from "./security-forms";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/account/security");
  const [sessions, pending] = await Promise.all([
    dashboardAuth().listSessions(session),
    listPendingDeletions(toPrincipal(session)),
  ]);
  const now = new Date();
  return (
    <div className="flex min-h-dvh flex-col">
      <AccountHeaderBar />
      <main
        id="main"
        // The settings column (48 rem), plus the side index from 1280 px, centred.
        className="mx-auto w-full max-w-[52rem] flex-1 px-4 pt-8 pb-16 sm:px-6 lg:px-8 lg:pt-12 xl:max-w-[68.5rem] xl:px-10"
      >
        <header className="mb-6 flex items-center gap-4 lg:mb-8">
          <Avatar name={session.name} size="xl" />
          <div className="min-w-0">
            <p className="text-overline text-ink-faint uppercase">Your account</p>
            <h1 className="mt-1 font-display text-h3 text-ink md:text-h2">Account security</h1>
            <p className="mt-1 truncate text-body-sm text-ink-muted">
              {session.name} · {session.email}
            </p>
          </div>
        </header>
        <AccountTabs current="security" />
        <SettingsLayout
          sections={[
            ...(pending.length > 0
              ? [{ id: "deletions", label: "Organisations being deleted" }]
              : []),
            { id: "sessions", label: "Signed-in devices" },
            { id: "password", label: "Password" },
            { id: "confirm", label: "Confirm it's you" },
            { id: "delete-account", label: "Delete account", danger: true },
          ]}
        >
          {pending.length > 0 ? (
            <SettingsSection
              id="deletions"
              title="Organisations being deleted"
              description="Their stores are closed. Cancel to bring an organisation back before its deletion date."
            >
              <ul className="divide-y divide-line">
                {pending.map((p) => (
                  <PendingDeletionRow
                    key={p.id}
                    orgId={toTypeId("organisation", p.id)}
                    name={p.name}
                    when={formatLongDate(p.scheduledAt, "UTC")}
                  />
                ))}
              </ul>
            </SettingsSection>
          ) : null}
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
          <SettingsSection
            id="delete-account"
            title="Delete account"
            description="Removes your account for good. This can't be undone."
          >
            <DeleteAccountForm email={session.email} />
          </SettingsSection>
        </SettingsLayout>
      </main>
    </div>
  );
}
