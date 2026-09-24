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
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import type { ShellData } from "./types";

/** Combined organisation + store switcher shown at the top of the navigation. */
export function ContextSwitcher({ data, compact = false }: { data: ShellData; compact?: boolean }) {
  const current = data.store?.name ?? data.organisation.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch store or organisation. Current: ${current}`}
        className={cn(
          "flex items-center gap-2.5 rounded-control text-left outline-none transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand-600",
          compact ? "size-11 justify-center" : "w-full px-2 py-2",
        )}
      >
        <Avatar name={current} className="rounded-control" />
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{current}</span>
              <span className="block truncate text-xs text-ink-muted">
                {data.store ? data.organisation.name : "Organisation"}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-4 text-ink-faint" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel>Stores in {data.organisation.name}</DropdownMenuLabel>
        {data.stores.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-ink-muted">No stores yet</p>
        ) : (
          data.stores.map((store) => (
            <DropdownMenuItem key={store.id} asChild>
              <Link href={store.href}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{store.label}</span>
                  {store.description ? (
                    <span className="block truncate text-xs text-ink-muted">
                      {store.description}
                    </span>
                  ) : null}
                </span>
                {data.store?.id === store.id ? (
                  <Check aria-label="Current store" className="size-4 text-brand-700" />
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        {data.canCreateStore ? (
          <DropdownMenuItem asChild>
            <Link href={data.createStoreHref} className="text-brand-700">
              <Plus aria-hidden="true" className="size-4" /> Create store
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={data.organisation.href}>Organisation overview</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Organisations</DropdownMenuLabel>
        {data.organisations.map((org) => (
          <DropdownMenuItem key={org.id} asChild>
            <Link href={org.href}>
              <span className="flex-1 truncate">{org.label}</span>
              {org.id === data.organisation.id ? (
                <Check aria-label="Current organisation" className="size-4 text-brand-700" />
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1" className="text-brand-700">
            <Plus aria-hidden="true" className="size-4" /> Create organisation
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
