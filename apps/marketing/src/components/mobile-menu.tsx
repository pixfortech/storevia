"use client";

// Phones and tablets: the navigation in a drawer (full screen on phones, a
// side panel on tablets). Each section is a large link to its landing page,
// with a toggle that reveals the pages inside it; Log in and Start free stay
// pinned at the bottom.
import { buttonClasses, cn, Dialog, Glyph, Icon, Logo } from "@storevia/ui";
import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { StatusPill } from "./marketing/status-pill";
import { isCurrentSection, PRIMARY_NAV, type NavMenu } from "./nav";

function SectionLinks({
  menu,
  id,
  onNavigate,
}: {
  menu: NavMenu;
  id: string;
  onNavigate: () => void;
}) {
  return (
    <div id={id} className="pb-4">
      {menu.groups.map((group) => (
        <div key={group.heading} className="mt-1 first:mt-0">
          <p className="px-1 pt-3 pb-1 text-overline text-ink-faint uppercase">{group.heading}</p>
          <ul>
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  className="-mx-2 flex min-h-12 items-center gap-3 rounded-control px-3 py-2 text-body text-ink transition-colors duration-(--duration-fast) hover:bg-subtle active:bg-muted"
                >
                  {link.glyph ? (
                    <Glyph name={link.glyph} className="size-5 text-ink" />
                  ) : link.icon ? (
                    <Icon icon={link.icon} size="md" className="text-ink-muted" />
                  ) : null}
                  <span className="min-w-0 flex-1">{link.title}</span>
                  {link.status ? <StatusPill status={link.status} /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function MobileMenu({
  pathname,
  signInHref,
  signUpHref,
}: {
  pathname: string;
  signInHref: string;
  signUpHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [seen, setSeen] = useState(pathname);
  const baseId = useId();
  // Close on navigation (including links that stay on this page).
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  const close = () => {
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setExpanded(null);
      }}
      side="right"
      title={
        <>
          <span className="sr-only">Menu</span>
          <span aria-hidden="true">
            <Logo />
          </span>
        </>
      }
      className="w-full sm:w-[26rem]"
      footer={
        <>
          <a href={signInHref} className={buttonClasses("secondary", "lg", "sm:flex-1")}>
            Log in
          </a>
          <a href={signUpHref} className={buttonClasses("primary", "lg", "sm:flex-1")}>
            Start free
          </a>
        </>
      }
      trigger={
        <button
          type="button"
          aria-label="Open menu"
          className="-mr-1.5 flex size-11 items-center justify-center rounded-control text-ink transition-colors duration-(--duration-fast) hover:bg-subtle lg:hidden"
        >
          <Icon icon={Menu} size="md" />
        </button>
      }
    >
      <nav aria-label="Main" className="-mt-1">
        <ul>
          {PRIMARY_NAV.map((item) => {
            const current = isCurrentSection(item, pathname);
            const panelId = `${baseId}-${item.label}`;
            const isOpen = expanded === item.label;
            return (
              <li key={item.href} className="border-b border-line last:border-b-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className="flex min-h-15 flex-1 items-center gap-2.5 font-display text-h4 text-ink"
                  >
                    {item.label}
                    {current ? (
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-600" />
                    ) : null}
                  </Link>
                  {item.kind === "menu" ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? panelId : undefined}
                      aria-label={`${item.label} pages`}
                      onClick={() => {
                        setExpanded(isOpen ? null : item.label);
                      }}
                      className="-mr-2 flex size-12 items-center justify-center rounded-control text-ink-muted transition-colors duration-(--duration-fast) hover:bg-subtle hover:text-ink"
                    >
                      <Icon
                        icon={ChevronDown}
                        size="md"
                        className={cn(
                          "transition-transform duration-(--duration-base) ease-(--ease-standard)",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                  ) : null}
                </div>
                {item.kind === "menu" && isOpen ? (
                  <SectionLinks menu={item} id={panelId} onNavigate={close} />
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-8 text-caption text-ink-faint">
          Storevia is in active development. Every feature on this site shows its status.
        </p>
      </nav>
    </Dialog>
  );
}
