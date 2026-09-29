// Pieces shared by the account pages (profile, security): pages outside the
// app shell, about the signed-in person rather than an organisation.
import { Icon } from "@storevia/ui/icons";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { SignOutButton, StandaloneHeader } from "./standalone";

/** The standalone header with the way back to the dashboard and sign-out. */
export function AccountHeaderBar() {
  return (
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
  );
}

/** Moves between the account pages; each is its own URL. */
export function AccountTabs({ current }: { current: "profile" | "security" }) {
  return (
    <LinkTabs
      label="Your account"
      className="mb-8 lg:mb-10"
      tabs={[
        { href: "/account/profile", label: "Profile", current: current === "profile" },
        { href: "/account/security", label: "Security", current: current === "security" },
      ]}
    />
  );
}
