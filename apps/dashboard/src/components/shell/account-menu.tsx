"use client";

import {
  Avatar,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@storevia/ui";
import { ChevronsUpDown, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { startTransition } from "react";
import { signOutAction } from "@/app/(app)/account/actions";

/**
 * The signed-in person and their account actions. `row` is the sidebar's
 * full-width entry; `icon` is a 44 px avatar for the tablet rail and the
 * phone's top bar.
 */
export function AccountMenu({
  user,
  variant = "row",
  side = "bottom",
  align = "start",
}: {
  user: { name: string; email: string };
  variant?: "row" | "icon";
  side?: "top" | "right" | "bottom";
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // The visible name is part of the accessible one (WCAG 2.5.3).
        aria-label={`Account menu: ${user.name}`}
        className={cn(
          "group flex items-center rounded-control text-left transition-colors duration-(--duration-fast) hover:bg-subtle data-[state=open]:bg-subtle",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
          variant === "icon" ? "size-11 justify-center" : "w-full gap-3 px-2 py-1.5",
        )}
      >
        <Avatar name={user.name} size="md" />
        {variant === "row" ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label text-ink">{user.name}</span>
              <span className="block truncate text-caption text-ink-muted">{user.email}</span>
            </span>
            <Icon
              icon={ChevronsUpDown}
              size="sm"
              className="text-ink-faint group-hover:text-ink-muted"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="w-64">
        <DropdownMenuLabel className="pt-2.5 pb-2">
          <span className="block truncate text-label text-ink">{user.name}</span>
          <span className="block truncate font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild icon={ShieldCheck}>
          <Link href="/account/security">Account security</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* A <form> inside the menu would unmount (and cancel) when the menu
            closes, so the action is invoked directly from onSelect. */}
        <DropdownMenuItem
          icon={LogOut}
          onSelect={() => {
            startTransition(() => signOutAction());
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
