import { buttonClasses, Logo } from "@storevia/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(app)/account/actions";

/**
 * The header of pages outside the app shell (onboarding, invitations,
 * account security): the logo, linking home, and a few quiet actions.
 */
export function StandaloneHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-canvas px-4 sm:px-8">
      <Link
        href="/"
        className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
      >
        <Logo size="sm" />
      </Link>
      {children ? <div className="flex min-w-0 items-center gap-1 sm:gap-2">{children}</div> : null}
    </header>
  );
}

/** Ends the session (the unchanged sign-out action). */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className={buttonClasses("ghost", "sm")}>
        Sign out
      </button>
    </form>
  );
}
