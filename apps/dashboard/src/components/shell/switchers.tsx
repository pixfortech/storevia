"use client";

import { cn } from "@storevia/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@storevia/ui/dropdown-menu";
import { Glyph, GlyphTile, Icon } from "@storevia/ui/icons";
import { Avatar } from "@storevia/ui/surfaces";
import { Check, ChevronsUpDown, Lock, Plus, Store } from "lucide-react";
import Link from "next/link";
import type { ShellData } from "./types";

/** The current store's business-type glyph, or the organisation's initials. */
function ScopeTile({ data, small = false }: { data: ShellData; small?: boolean }) {
  return data.store ? (
    <GlyphTile name={data.store.glyph} size="sm" tone="neutral" className={cn(small && "size-8")} />
  ) : (
    <Avatar
      name={data.organisation.name}
      shape="square"
      className={cn("text-label", small ? "size-8" : "size-9")}
    />
  );
}

/**
 * In place of "Create store" when the plan has no room for another: says why,
 * and leads to Billing for members who may read it.
 */
function StoreLimitNote({ href }: { href?: string | undefined }) {
  const text = (
    <span className="min-w-0 flex-1">
      <span className="block font-medium text-ink">Store limit reached</span>
      <span className="block text-caption text-ink-muted">
        {href ? "See your plan in Billing" : "Ask an owner about the plan"}
      </span>
    </span>
  );
  return href ? (
    <DropdownMenuItem asChild icon={Lock} className="py-2">
      <Link href={href}>{text}</Link>
    </DropdownMenuItem>
  ) : (
    // Nothing to open: a disabled item keeps the reason in the menu for screen readers.
    <DropdownMenuItem disabled icon={Lock} className="py-2">
      {text}
    </DropdownMenuItem>
  );
}

/**
 * The store selector: every store in the organisation, the organisation's
 * store list and the member's other organisations. `sidebar` is the desktop
 * control, `bar` the tablet top bar's, `compact` the phone's (name only).
 */
export function StoreSwitcher({
  data,
  variant = "sidebar",
  align = "start",
}: {
  data: ShellData;
  variant?: "sidebar" | "bar" | "compact";
  align?: "start" | "end";
}) {
  const current = data.store?.name ?? data.organisation.name;
  const context = data.store ? data.organisation.name : "Organisation";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch store or organisation. Current: ${current}`}
        className={cn(
          "group flex min-w-0 items-center text-left transition-[background-color,border-color,box-shadow] duration-(--duration-fast)",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          variant === "sidebar"
            ? "w-full gap-3 rounded-card border border-line bg-surface p-2 pr-2.5 shadow-xs hover:border-line-strong hover:bg-subtle data-[state=open]:border-line-strong data-[state=open]:bg-subtle"
            : "max-w-full rounded-control hover:bg-subtle data-[state=open]:bg-subtle",
          variant === "bar" && "h-11 gap-2.5 pr-2.5 pl-1.5",
          variant === "compact" && "h-11 gap-1.5 px-2",
        )}
      >
        {variant === "compact" ? null : <ScopeTile data={data} small={variant === "bar"} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-semibold text-ink">{current}</span>
          {variant === "compact" ? null : (
            <span className="block truncate text-caption text-ink-muted">{context}</span>
          )}
        </span>
        <Icon
          icon={ChevronsUpDown}
          size="sm"
          className="text-ink-faint transition-colors group-hover:text-ink-muted"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-72">
        <DropdownMenuLabel>Stores in {data.organisation.name}</DropdownMenuLabel>
        {data.stores.length === 0 ? (
          <p className="px-2.5 py-2 text-body-sm text-ink-muted">No stores yet</p>
        ) : (
          data.stores.map((store) => (
            <DropdownMenuItem key={store.id} asChild className="py-2">
              <Link href={store.href}>
                {store.glyph ? (
                  <Glyph name={store.glyph} className="size-5 text-ink-muted" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{store.label}</span>
                  {store.description ? (
                    <span className="block truncate text-caption text-ink-muted">
                      {store.description}
                    </span>
                  ) : null}
                </span>
                {data.store?.id === store.id ? (
                  <Icon icon={Check} size="sm" label="Current store" className="text-brand-600" />
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        {data.canCreateStore ? (
          <DropdownMenuItem asChild icon={Plus} className="text-brand-700">
            <Link href={data.createStoreHref}>Create store</Link>
          </DropdownMenuItem>
        ) : data.storeLimit ? (
          <StoreLimitNote href={data.storeLimit.href} />
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild icon={Store}>
          <Link href={data.organisation.href}>All stores</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Organisations</DropdownMenuLabel>
        {data.organisations.map((org) => (
          <DropdownMenuItem key={org.id} asChild>
            <Link href={org.href}>
              <Avatar name={org.label} size="xs" shape="square" />
              <span className="min-w-0 flex-1 truncate">{org.label}</span>
              {org.id === data.organisation.id ? (
                <Icon
                  icon={Check}
                  size="sm"
                  label="Current organisation"
                  className="text-brand-600"
                />
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild icon={Plus} className="text-brand-700">
          <Link href="/onboarding?new=1">Create organisation</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
