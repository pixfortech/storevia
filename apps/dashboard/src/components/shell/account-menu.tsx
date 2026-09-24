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
} from "@storevia/ui";
import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { startTransition } from "react";
import { signOutAction } from "@/app/(app)/account/actions";

export function AccountMenu({
  user,
  compact = false,
  align = "start",
}: {
  user: { name: string; email: string };
  compact?: boolean;
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-2.5 rounded-control text-left outline-none transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand-600",
          compact ? "size-11 justify-center" : "w-full px-2 py-2",
        )}
      >
        <Avatar name={user.name} />
        {compact ? null : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
            <span className="block truncate text-xs text-ink-muted">{user.email}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/account/security">
            <ShieldCheck aria-hidden="true" className="size-4" /> Account security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* A <form> inside the menu would unmount (and cancel) when the menu
            closes, so the action is invoked directly from onSelect. */}
        <DropdownMenuItem
          onSelect={() => {
            startTransition(() => signOutAction());
          }}
        >
          <LogOut aria-hidden="true" className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
