"use client";

import { CommandMenu, cn, Icon, Kbd, useCommandShortcut, type CommandItem } from "@storevia/ui";
import { Building2, Plus, Search, ShieldCheck, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, use, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { NAV_ICONS } from "./icons";
import { linkStatus, navigationGroups } from "./navigation";
import type { ShellData } from "./types";

const CommandContext = createContext<() => void>(() => undefined);

/** Every destination the member can reach from here. Nothing else. */
function commandItems(data: ShellData): (CommandItem & { href: string })[] {
  const items: (CommandItem & { href: string })[] = [];
  const scope = data.store ? data.store.name : data.organisation.name;
  // The sidebar's order (its groups), not the business type's raw list.
  const links = navigationGroups({ ...data, organisationLinks: [] }).flatMap((g) => g.links);
  for (const link of links) {
    items.push({
      id: `nav-${link.key}`,
      label: link.label,
      group: scope,
      // The sidebar's words ("Soon"), never internal milestone names.
      hint: linkStatus(link),
      icon: <Icon icon={NAV_ICONS[link.icon]} size="sm" />,
      href: link.href,
    });
  }
  for (const link of data.organisationLinks) {
    items.push({
      id: `org-${link.key}`,
      label: link.label,
      // As in the sidebar; a store may share its organisation's name.
      group: "Organisation",
      icon: <Icon icon={NAV_ICONS[link.icon]} size="sm" />,
      keywords: link.key === "members" ? ["team", "invite", "people"] : undefined,
      href: link.href,
    });
  }
  for (const action of data.createActions) {
    items.push({
      id: `create-${action.key}`,
      label: action.label,
      group: "Create",
      icon: <Icon icon={Plus} size="sm" />,
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
      icon: <Icon icon={Store} size="sm" />,
      keywords: ["switch", "store"],
      href: store.href,
    });
  }
  for (const org of data.organisations) {
    items.push({
      id: `organisation-${org.id}`,
      label: org.label,
      group: "Organisations",
      icon: <Icon icon={Building2} size="sm" />,
      keywords: ["switch", "organisation", "organization"],
      href: org.href,
    });
  }
  items.push({
    id: "account-security",
    label: "Account security",
    group: "Account",
    icon: <Icon icon={ShieldCheck} size="sm" />,
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

function noop(): () => void {
  return () => undefined;
}

// The server renders the Mac hint; other platforms switch to "Ctrl K" when
// they hydrate (useSyncExternalStore reconciles the two without a mismatch).
function useShortcutLabel(): string {
  return useSyncExternalStore(
    noop,
    () => (/mac|iphone|ipad|ipod/i.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}

/** Opens the command menu. `field` looks like a search field; `icon` is the phone's 44 px button. */
export function CommandTrigger({ variant = "field" }: { variant?: "field" | "icon" }) {
  const open = use(CommandContext);
  const shortcut = useShortcutLabel();
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Search and jump to"
        aria-keyshortcuts="Control+K Meta+K"
        className="flex size-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <Icon icon={Search} size="md" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        "flex h-9 w-40 items-center gap-2.5 rounded-control border border-line bg-subtle px-3 text-body-sm text-ink-faint lg:w-60 xl:w-72",
        "transition-colors duration-(--duration-fast) hover:border-line-strong hover:bg-surface hover:text-ink-muted",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <Icon icon={Search} size="sm" />
      <span className="flex-1 truncate text-left">
        Search<span className="hidden lg:inline"> or jump to…</span>
      </span>
      <Kbd>{shortcut}</Kbd>
    </button>
  );
}
