"use client";

// Command menu (docs/architecture/12-design-system.md §7): a keyboard-first
// jump list. It only lists destinations the caller passes in, which are real,
// permission-filtered routes; it never invents actions.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeft, Search, SearchX } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Kbd } from "./data";
import { Icon } from "./icons";
import {
  openingOrigin,
  registerLayerReturn,
  restoreFocus,
  type FocusResolver,
} from "./overlays-focus";

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

/** Registers ⌘K / Ctrl+K to toggle the menu. */
export function useCommandShortcut(toggle: () => void): void {
  const ref = useRef(toggle);
  useEffect(() => {
    ref.current = toggle;
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        ref.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

/* ----------------------------------------------------------------------------
 * Parts shared by the live menu and its static preview
 * ------------------------------------------------------------------------- */

const PANEL =
  "flex flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-window";

function SearchRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line px-5">
      <Icon icon={Search} size="md" className="text-ink-faint" />
      {children}
    </div>
  );
}

const GROUP_LABEL = "px-3 pt-2.5 pb-1.5 text-caption font-medium text-ink-faint";

/**
 * One result: a bare 16 px icon, the label and its hint. 40 px tall for a
 * mouse and 44 px on touch screens; on phones the hint drops under the label
 * rather than disappearing, so a status such as "Soon" is always visible.
 */
function CommandRow({
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

function CommandEmpty({ query }: { query: string }) {
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

const resultCount = (count: number) => (count === 1 ? "1 result" : `${String(count)} results`);

/** Key hints; hidden on phones, where there is no keyboard to hint at. */
function CommandFooter({ count }: { count: number }) {
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
      <span className="ml-auto tabular-nums">{resultCount(count)}</span>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * CommandMenu
 * ------------------------------------------------------------------------- */

export function CommandMenu({
  open,
  onOpenChange,
  items,
  onSelect,
  placeholder = "Search or jump to…",
  label = "Command menu",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly CommandItem[];
  onSelect: (item: CommandItem) => void;
  placeholder?: string;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // The menu has no trigger, so it returns focus to wherever the user was,
  // or, if that was inside a layer that is closing, to that layer's trigger.
  const returnFocus = useRef<FocusResolver>(() => null);

  const groups = useMemo(() => commandResults(items, query), [items, query]);
  const results = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const current = results[Math.min(active, Math.max(0, results.length - 1))];

  useEffect(() => {
    if (!current) return;
    document.getElementById(`${listId}-${current.id}`)?.scrollIntoView({ block: "nearest" });
  }, [current, listId]);

  function change(next: boolean) {
    if (!next) {
      setQuery("");
      setActive(0);
    }
    onOpenChange(next);
  }

  function choose(item: CommandItem | undefined) {
    if (!item) return;
    change(false);
    onSelect(item);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={change}>
      <DialogPrimitive.Portal>
        {/* Same overlay as Dialog: navy at 32%, no blur. */}
        <DialogPrimitive.Overlay className="fixed -inset-16 z-(--z-overlay) bg-[rgb(11_21_48/0.32)] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-sv-layer=""
          data-sv-modal=""
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const layer = event.currentTarget as HTMLElement;
            returnFocus.current = openingOrigin(layer, null);
            registerLayerReturn(layer, returnFocus.current);
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            restoreFocus(event, returnFocus.current);
          }}
          className={cn(
            PANEL,
            "fixed inset-x-3 top-3 z-(--z-modal) mx-auto max-h-[min(36rem,calc(100dvh-1.5rem))] max-w-160 outline-none sm:top-[14vh]",
            "data-[state=open]:animate-scale-in",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <SearchRow>
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-label={label}
              aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
              value={query}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                // Home and End stay with the text field (they move the caret).
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => (results.length ? (i + 1) % results.length : 0));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) =>
                    results.length ? (i - 1 + results.length) % results.length : 0,
                  );
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(current);
                }
              }}
              className="h-15 min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none"
            />
          </SearchRow>
          <p aria-live="polite" className="sr-only">
            {query.trim() ? resultCount(results.length) : ""}
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label="Results"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {results.length === 0 ? (
              <CommandEmpty query={query} />
            ) : (
              groups.map((group, g) => (
                <div
                  key={group.name}
                  role="group"
                  aria-labelledby={`${listId}-g${String(g)}`}
                  className="not-first:mt-1"
                >
                  <div id={`${listId}-g${String(g)}`} className={GROUP_LABEL}>
                    {group.name}
                  </div>
                  {group.items.map((item) => {
                    const selected = item === current;
                    return (
                      <CommandRow
                        key={item.id}
                        item={item}
                        selected={selected}
                        id={`${listId}-${item.id}`}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => {
                          if (!selected) setActive(results.indexOf(item));
                        }}
                        onClick={() => {
                          choose(item);
                        }}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <CommandFooter count={results.length} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface CommandMenuPreviewProps {
  items: readonly CommandItem[];
  /** Text in the search field; it filters the items as typing would. */
  query?: string;
  /** The highlighted result. Default: the first. */
  activeId?: string;
  placeholder?: string;
  className?: string;
}

/**
 * A static, inert render of the open command menu for galleries and product
 * visuals: the live menu's parts, without the dialog, and hidden from
 * assistive technology.
 */
export function CommandMenuPreview({
  items,
  query = "",
  activeId,
  placeholder = "Search or jump to…",
  className,
}: CommandMenuPreviewProps) {
  const groups = commandResults(items, query);
  const results = groups.flatMap((group) => group.items);
  const current = results.find((item) => item.id === activeId) ?? results[0];
  return (
    <div inert aria-hidden="true" className={cn(PANEL, "w-full max-w-160 text-left", className)}>
      <SearchRow>
        <span
          className={cn(
            "flex h-15 min-w-0 flex-1 items-center truncate text-body",
            query ? "text-ink" : "text-ink-faint",
          )}
        >
          {query || placeholder}
        </span>
      </SearchRow>
      <div className="p-2">
        {results.length === 0 ? (
          <CommandEmpty query={query} />
        ) : (
          groups.map((group) => (
            <div key={group.name} className="not-first:mt-1">
              <div className={GROUP_LABEL}>{group.name}</div>
              {group.items.map((item) => (
                <CommandRow key={item.id} item={item} selected={item === current} />
              ))}
            </div>
          ))
        )}
      </div>
      <CommandFooter count={results.length} />
    </div>
  );
}
