// Command menu parts shared by the live menu (command.tsx) and its static
// preview (command-preview.tsx): item types, filtering and the row markup.
// Server-safe: no hooks, no handlers.
import { CornerDownLeft, Search, SearchX } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Kbd } from "./data";
import { Icon } from "./icons";

export interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  /**
   * Secondary text, e.g. the organisation a store belongs to, or a status
   * such as "Soon". Shown at every width (under the label on phones).
   */
  readonly hint?: string | undefined;
  readonly icon?: ReactNode;
  /** Extra words that should match (e.g. "team" for Members). */
  readonly keywords?: readonly string[] | undefined;
}

function matches(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.label, item.hint ?? "", item.group, ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export interface CommandGroup {
  readonly name: string;
  readonly items: readonly CommandItem[];
}

/**
 * Filters items by every word of the query and groups them in order of each
 * group's first appearance. The flattened groups are the keyboard order.
 */
export function commandResults(items: readonly CommandItem[], query: string): CommandGroup[] {
  const groups = new Map<string, CommandItem[]>();
  for (const item of items) {
    if (!matches(item, query.trim())) continue;
    const list = groups.get(item.group);
    if (list) list.push(item);
    else groups.set(item.group, [item]);
  }
  return [...groups].map(([name, list]) => ({ name, items: list }));
}

/* ----------------------------------------------------------------------------
 * Parts shared by the live menu and its static preview
 * ------------------------------------------------------------------------- */

export const PANEL =
  "flex flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-window";

export function SearchRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line px-5">
      <Icon icon={Search} size="md" className="text-ink-faint" />
      {children}
    </div>
  );
}

export const GROUP_LABEL = "px-3 pt-2.5 pb-1.5 text-caption font-medium text-ink-faint";

/**
 * One result: a bare 16 px icon, the label and its hint. 40 px tall for a
 * mouse and 44 px on touch screens; on phones the hint drops under the label
 * rather than disappearing, so a status such as "Soon" is always visible.
 */
export function CommandRow({
  item,
  selected,
  className,
  ...props
}: { item: CommandItem; selected: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-3 py-1.5 text-body-sm pointer-coarse:min-h-11",
        selected && "bg-subtle",
        className,
      )}
      {...props}
    >
      {item.icon ? (
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center transition-colors duration-(--duration-fast) [&>svg]:size-4",
            selected ? "text-brand-600" : "text-ink-faint",
          )}
        >
          {item.icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <span className="truncate font-medium text-ink">{item.label}</span>
        {item.hint ? (
          <>
            {/* Keeps the label and hint apart in the option's accessible name. */}
            <span className="sr-only">, </span>
            <span className="truncate text-caption text-ink-faint sm:ml-auto sm:max-w-[45%]">
              {item.hint}
            </span>
          </>
        ) : null}
      </span>
      <Icon
        icon={CornerDownLeft}
        size="xs"
        className={cn(
          "shrink-0 text-ink-faint pointer-coarse:hidden",
          selected ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

export function CommandEmpty({ query }: { query: string }) {
  return (
    <div role="presentation" className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-card bg-subtle text-ink-faint ring-1 ring-line ring-inset">
        <Icon icon={SearchX} size="md" />
      </span>
      <p className="mt-4 text-body-sm font-medium text-ink">No results for “{query.trim()}”</p>
      <p className="mt-1 text-body-sm text-ink-muted">Check the spelling, or try a shorter word.</p>
    </div>
  );
}

export const resultCount = (count: number) =>
  count === 1 ? "1 result" : `${String(count)} results`;

/** Key hints; hidden on phones, where there is no keyboard to hint at. */
export function CommandFooter({ count }: { count: number }) {
  return (
    <div className="hidden shrink-0 items-center gap-5 border-t border-line bg-subtle px-5 py-2.5 text-caption text-ink-faint sm:flex">
      <span className="flex items-center gap-1.5">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span className="ml-0.5">Navigate</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>↵</Kbd>
        <span className="ml-0.5">Open</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>Esc</Kbd>
        <span className="ml-0.5">Close</span>
      </span>
      <span className="ml-auto whitespace-nowrap tabular-nums">{resultCount(count)}</span>
    </div>
  );
}
