"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@storevia/ui/dropdown-menu";
import { Icon } from "@storevia/ui/icons";
import { Avatar, Badge } from "@storevia/ui/surfaces";
import { ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { startTransition } from "react";
import { signOutAction } from "@/app/(auth)/actions";

/** The signed-in staff member: who they are, their role, and signing out. */
export function StaffMenu({
  staff,
  environment,
}: {
  staff: { name: string; email: string; role: string; recentlyConfirmed: boolean };
  /** e.g. "Development environment · Mock billing enabled". */
  environment: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // The visible initials come from the name, so the name leads the label.
        aria-label={`Account menu: ${staff.name}`}
        className="group inline-flex h-10 items-center gap-1 rounded-control pr-1.5 pl-1 transition-colors duration-(--duration-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=open]:bg-subtle pointer-coarse:h-11"
      >
        <Avatar name={staff.name} size="md" />
        <Icon icon={ChevronDown} size="xs" className="text-ink-faint group-hover:text-ink-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="pt-2.5 pb-2 whitespace-normal">
          <span className="block truncate text-label text-ink">{staff.name}</span>
          <span className="block truncate font-normal">{staff.email}</span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="brand" size="sm">
              {staff.role}
            </Badge>
            {staff.recentlyConfirmed ? (
              <Badge tone="success" size="sm" dot>
                Password confirmed
              </Badge>
            ) : null}
          </span>
          <span className="mt-2 block font-normal">{environment}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild icon={UserRound}>
          <Link href="/account">Account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild icon={ShieldCheck}>
          <Link href="/account#confirm">Confirm password</Link>
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
