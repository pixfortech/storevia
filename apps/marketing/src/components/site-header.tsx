import { buttonClasses, Logo } from "@storevia/ui";
import Link from "next/link";
import { appLinks } from "@/lib/env";
import { MobileMenu } from "./mobile-menu";
import { PRIMARY_NAV } from "./nav";
import { NavLink } from "./nav-link";

export function SiteHeader() {
  const links = appLinks();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-(--container-content) items-center gap-4 px-4 sm:px-6 lg:gap-8 lg:px-8">
        <Link href="/" aria-label="Storevia home" className="rounded-control">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {/* The smallest phones find "Log in" in the menu sheet instead. */}
          <a
            href={links.signIn}
            className={buttonClasses("ghost", "sm", "hidden min-[400px]:inline-flex")}
          >
            Log in
          </a>
          <a href={links.signUp} className={buttonClasses("primary", "sm")}>
            Start free
          </a>
          <MobileMenu signInHref={links.signIn} />
        </div>
      </div>
    </header>
  );
}
