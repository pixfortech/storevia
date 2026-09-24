"use client";

import {
  CommandMenu,
  ICON_STROKE,
  Kbd,
  cn,
  useCommandShortcut,
  type CommandItem,
} from "@storevia/ui";
import { Building2, Plus, Search, ShieldCheck, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { NAV_ICONS } from "./icons";
import type { ShellData } from "./types";

const CommandContext = createContext<() => void>(() => undefined);

const iconProps = { "aria-hidden": true, strokeWidth: ICON_STROKE, className: "size-4" } as const;

/** Every destination the member can reach from here. Nothing else. */
function commandItems(data: ShellData): (CommandItem & { href: string })[] {
  const items: (CommandItem & { href: string })[] = [];
  const scope = data.store ? data.store.name : data.organisation.name;
  for (const link of data.links) {
    const Icon = NAV_ICONS[link.icon];
    items.push({
      id: `nav-${link.key}`,
      label: link.label,
      group: scope,
      hint: link.soon ? `Coming in ${link.soon}` : undefined,
      icon: <Icon {...iconProps} />,
      href: link.href,
    });
  }
  for (const link of data.organisationLinks) {
    const Icon = NAV_ICONS[link.icon];
    items.push({
      id: `org-${link.key}`,
      label: link.label,
      group: data.organisation.name,
      icon: <Icon {...iconProps} />,
      keywords: link.key === "members" ? ["team", "invite", "people"] : undefined,
      href: link.href,
    });
  }
  for (const action of data.createActions) {
    items.push({
      id: `create-${action.href}`,
      label: action.label,
      group: "Create",
      icon: <Plus {...iconProps} />,
      keywords: ["new", "add"],
      href: action.href,
    });
  }
  for (const store of data.stores) {
    items.push({
      id: `store-${store.id}`,
      label: store.label,
      group: "Stores",
      hint: store.description,
      icon: <Store {...iconProps} />,
      keywords: ["switch", "store"],
      href: store.href,
    });
  }
  for (const org of data.organisations) {
    items.push({
      id: `organisation-${org.id}`,
      label: org.label,
      group: "Organisations",
      icon: <Building2 {...iconProps} />,
      keywords: ["switch", "organisation", "organization"],
      href: org.href,
    });
  }
  items.push({
    id: "account-security",
    label: "Account security",
    group: "Account",
    icon: <ShieldCheck {...iconProps} />,
    keywords: ["password", "sessions", "sign out"],
    href: "/account/security",
  });
  return items;
}

export function CommandProvider({ data, children }: { data: ShellData; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => commandItems(data), [data]);
  const toggle = () => {
    setOpen((o) => !o);
  };
  useCommandShortcut(toggle);
  return (
    <CommandContext
      value={() => {
        setOpen(true);
      }}
    >
      {children}
      <CommandMenu
        open={open}
        onOpenChange={setOpen}
        items={items}
        placeholder="Jump to a page, store or organisation…"
        onSelect={(item) => {
          const target = items.find((i) => i.id === item.id);
          if (target) router.push(target.href);
        }}
      />
    </CommandContext>
  );
}

/** Opens the command menu. `variant="field"` looks like a search field (desktop/tablet). */
export function CommandTrigger({ variant = "field" }: { variant?: "field" | "icon" }) {
  const open = use(CommandContext);
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Search and jump to"
        aria-keyshortcuts="Control+K Meta+K"
        className="flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-subtle hover:text-ink"
      >
        <Search {...iconProps} className="size-5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        "flex h-9 w-full max-w-72 items-center gap-2.5 rounded-control border border-line bg-surface px-3 text-sm text-ink-faint shadow-xs",
        "transition-colors hover:border-line-strong hover:text-ink-muted",
      )}
    >
      <Search {...iconProps} />
      <span className="flex-1 text-left">Search or jump to…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}
