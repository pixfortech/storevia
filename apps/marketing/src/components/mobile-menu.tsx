"use client";

import { Dialog, ICON_STROKE } from "@storevia/ui";
import { ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PRIMARY_NAV } from "./nav";

/** Phones and tablets: the main navigation in a side sheet. */
export function MobileMenu({ signInHref }: { signInHref: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  return (
    <span className="lg:hidden">
      <Dialog
        open={open}
        onOpenChange={setOpen}
        side="right"
        title="Menu"
        trigger={
          <button
            type="button"
            aria-label="Open menu"
            className="flex size-11 items-center justify-center rounded-control text-ink hover:bg-subtle"
          >
            <Menu aria-hidden="true" strokeWidth={ICON_STROKE} className="size-5" />
          </button>
        }
      >
        <nav aria-label="Main">
          <ul className="-mx-2 divide-y divide-line">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex h-14 items-center justify-between px-2 text-base font-medium text-ink"
                >
                  {item.label}
                  <ChevronRight
                    aria-hidden="true"
                    strokeWidth={ICON_STROKE}
                    className="size-4 text-ink-faint"
                  />
                </Link>
              </li>
            ))}
            <li>
              <a
                href={signInHref}
                className="flex h-14 items-center justify-between px-2 text-base font-medium text-ink"
              >
                Log in
                <ChevronRight
                  aria-hidden="true"
                  strokeWidth={ICON_STROKE}
                  className="size-4 text-ink-faint"
                />
              </a>
            </li>
          </ul>
        </nav>
      </Dialog>
    </span>
  );
}
