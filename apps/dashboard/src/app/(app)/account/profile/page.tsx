import { Avatar } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountHeaderBar, AccountTabs } from "@/components/areas/account";
import { SettingsLayout, SettingsSection } from "@/components/areas/settings";
import { dashboardAuth, getSession } from "@/lib/auth";
import { EmailChangeForm, NameForm } from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };

export default async function AccountProfilePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/account/profile");
  const pending = await dashboardAuth().pendingEmailChange(session);
  const minutesLeft = pending
    ? Math.max(1, Math.ceil((pending.expiresAt.getTime() - Date.now()) / 60_000))
    : 0;
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
            <h1 className="mt-1 font-display text-h3 text-ink md:text-h2">Profile</h1>
            <p className="mt-1 truncate text-body-sm text-ink-muted">
              {session.name} · {session.email}
            </p>
          </div>
        </header>
        <AccountTabs current="profile" />
        <SettingsLayout
          sections={[
            { id: "name", label: "Name" },
            { id: "email", label: "Email address" },
          ]}
        >
          <SettingsSection
            id="name"
            title="Name"
            description="How you appear to your team, in invitations and in activity."
          >
            <NameForm name={session.name} />
          </SettingsSection>
          <SettingsSection
            id="email"
            title="Email address"
            description="You sign in with it, and account notices go to it. A change takes effect once you confirm it from the new address."
          >
            <EmailChangeForm
              currentEmail={session.email}
              pending={pending ? { email: pending.email, minutesLeft } : null}
            />
          </SettingsSection>
        </SettingsLayout>
      </main>
    </div>
  );
}
