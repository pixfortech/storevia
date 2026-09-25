"use client";

import { cn } from "@storevia/ui/cn";
import { Tooltip, TooltipProvider } from "@storevia/ui/feedback";
import { Icon } from "@storevia/ui/icons";
import { Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { NAV_ICONS } from "./icons";
import { isActive, linkStatus, navigationGroups } from "./navigation";
import type { ShellData, ShellLink } from "./types";

/** sidebar: desktop rows · panel: the tablet drawer · sheet: the phone's More sheet. */
export type NavDensity = "sidebar" | "panel" | "sheet";

// Rows: 32 px for a mouse (44 on touch screens), 44 in the drawer, 48 on phones.
const ROW: Record<NavDensity, string> = {
  sidebar: "h-8 pointer-coarse:h-11",
  panel: "h-11",
  sheet: "h-12",
};

const FOCUS = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

/** "(not included in your plan)" is part of the link's name, so the lock never relies on the icon. */
function PlanLock() {
  return (
    <>
      <Icon icon={Lock} size="xs" />
      <span className="sr-only">(not included in your plan)</span>
    </>
  );
}

/** A quiet "Soon" for unbuilt areas and a lock for areas outside the plan. */
function LinkStatus({ link }: { link: ShellLink }) {
  if (!link.soon && !link.locked) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-ink-faint">
      {link.soon ? <span className="text-caption">Soon</span> : null}
      {link.locked ? <PlanLock /> : null}
    </span>
  );
}

function NavItem({
  link,
  active,
  density,
  onNavigate,
}: {
  link: ShellLink;
  active: boolean;
  density: NavDensity;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={cn(
        "group relative flex items-center gap-3 rounded-control px-2.5 text-body-sm font-medium",
        "transition-colors duration-(--duration-fast) ease-(--ease-standard)",
        ROW[density],
        FOCUS,
        active ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:bg-subtle hover:text-ink",
      )}
    >
      <Icon
        icon={NAV_ICONS[link.icon]}
        size="nav"
        className={cn(
          "transition-colors duration-(--duration-fast)",
          active ? "text-brand-600" : "text-ink-faint group-hover:text-ink-muted",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
      <LinkStatus link={link} />
      {active ? (
        // The active marker grows in on arrival (a transition from
        // @starting-style); reduced motion shows it at once.
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-2 -left-3 w-0.5 rounded-r-pill bg-brand-600 transition-[scale] duration-(--duration-base) ease-(--ease-emphasised) starting:scale-y-0",
            // Only the desktop sidebar has an edge to attach to.
            density !== "sidebar" && "hidden",
          )}
        />
      ) : null}
    </Link>
  );
}

/**
 * The full navigation in groups (Overview, Sell or Content, Website, Grow,
 * then Apps and Settings, then the organisation). Shared by the desktop
 * sidebar, the tablet drawer and the phone's More sheet.
 */
export function GroupedNavigation({
  data,
  density,
  onNavigate,
}: {
  data: ShellData;
  density: NavDensity;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const baseId = useId();
  const groups = navigationGroups(data);
  return (
    <div className={cn("flex flex-col", density === "sidebar" ? "gap-3" : "gap-6")}>
      {groups.map((group) => {
        const headingId = `${baseId}-${group.key}`;
        return (
          <div
            key={group.key}
            className={cn(
              // Apps and Settings: a hairline instead of a heading.
              group.key === "store" &&
                (density === "sidebar" ? "border-t border-line pt-2" : "border-t border-line pt-4"),
            )}
          >
            {group.label ? (
              <p
                id={headingId}
                className={cn(
                  "px-2.5 text-overline text-ink-faint uppercase",
                  density === "sidebar" ? "mb-1" : "mb-2",
                )}
              >
                {group.label}
              </p>
            ) : null}
            <ul
              {...(group.label ? { "aria-labelledby": headingId } : {})}
              className={cn(
                density === "sheet"
                  ? "grid grid-cols-1 gap-x-2 gap-y-1 min-[360px]:grid-cols-2"
                  : cn("flex flex-col", density === "panel" && "gap-0.5"),
              )}
            >
              {group.links.map((link) => (
                <li key={link.key} className="min-w-0">
                  <NavItem
                    link={link}
                    active={isActive(pathname, link)}
                    density={density}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function RailItem({ link, active }: { link: ShellLink; active: boolean }) {
  const status = linkStatus(link);
  return (
    <Tooltip
      content={status ? `${link.label} · ${status}` : link.label}
      side="right"
      sideOffset={10}
    >
      <Link
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex size-11 items-center justify-center rounded-control",
          "transition-colors duration-(--duration-fast) ease-(--ease-standard)",
          FOCUS,
          active ? "bg-brand-50 text-brand-600" : "text-ink-faint hover:bg-subtle hover:text-ink",
        )}
      >
        <Icon
          icon={NAV_ICONS[link.icon]}
          size="md"
          // Unbuilt areas sit back a step, so a touch user sees "Soon" without the tooltip.
          className={cn(link.soon && !active && "opacity-55 group-hover:opacity-100")}
        />
        <span className="sr-only">
          {link.label}
          {link.soon ? " Soon" : ""}
          {link.locked ? " (not included in your plan)" : ""}
        </span>
        {link.soon ? (
          // A hollow dot: a shape cue alongside the dimmed icon (the name says "Soon").
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full ring-1 ring-ink-faint"
          />
        ) : null}
        {link.locked ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 bottom-1.5 flex size-3.5 items-center justify-center rounded-full bg-surface text-ink-faint ring-1 ring-line"
          >
            <Icon icon={Lock} size="xs" strokeWidth={2.25} className="size-2" />
          </span>
        ) : null}
      </Link>
    </Tooltip>
  );
}

/** Tablet (768–1023 px): the store's areas as 44 px icons with tooltips, grouped by hairlines. */
export function RailNavigation({ data }: { data: ShellData }) {
  const pathname = usePathname();
  const groups = navigationGroups({ ...data, organisationLinks: [] });
  return (
    <TooltipProvider>
      <div className="flex flex-col items-center gap-2">
        {groups.map((group, index) => (
          <div key={group.key} className="flex flex-col items-center gap-2">
            {index > 0 ? <div aria-hidden="true" className="h-px w-6 bg-line" /> : null}
            <ul
              {...(group.label ? { "aria-label": group.label } : {})}
              className="flex flex-col items-center gap-1"
            >
              {group.links.map((link) => (
                <li key={link.key}>
                  <RailItem link={link} active={isActive(pathname, link)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
