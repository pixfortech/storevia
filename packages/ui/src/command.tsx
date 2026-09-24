"use client";

// Command menu (docs/architecture/12-design-system.md §7): a keyboard-first
// jump list. It only lists destinations the caller passes in, which are real,
// permission-filtered routes; it never invents actions.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Kbd } from "./data";
import { ICON_STROKE } from "./icons";

export interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  /** Secondary text, e.g. the organisation a store belongs to. */
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
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(
    () => items.filter((item) => matches(item, query.trim())),
    [items, query],
  );
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

  let lastGroup = "";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={change}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-fade-in bg-stone-950/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-h-[min(34rem,calc(100dvh-24px))] max-w-xl animate-rise-in flex-col overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-popover)] focus:outline-none sm:top-[12vh]"
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search
              aria-hidden="true"
              strokeWidth={ICON_STROKE}
              className="size-4 shrink-0 text-ink-faint"
            />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-label={label}
              aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
              value={query}
              placeholder={placeholder}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
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
              className="h-13 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none"
            />
            <span className="hidden sm:inline-flex">
              <Kbd>Esc</Kbd>
            </span>
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Results"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {results.length === 0 ? (
              <li role="presentation" className="px-3 py-8 text-center text-sm text-ink-muted">
                Nothing matches “{query}”.
              </li>
            ) : (
              results.map((item) => {
                const showGroup = item.group !== lastGroup;
                lastGroup = item.group;
                const selected = item === current;
                return (
                  <li key={item.id} role="presentation">
                    {showGroup ? (
                      <div
                        role="presentation"
                        className="px-3 pb-1 pt-3 text-xs font-medium text-ink-faint first:pt-1"
                      >
                        {item.group}
                      </div>
                    ) : null}
                    <div
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={selected}
                      onMouseMove={() => {
                        setActive(results.indexOf(item));
                      }}
                      onClick={() => {
                        choose(item);
                      }}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm",
                        selected ? "bg-subtle text-ink" : "text-ink-muted",
                      )}
                    >
                      {item.icon ? (
                        <span className="flex size-5 items-center justify-center text-ink-faint">
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">
                        {item.label}
                      </span>
                      {item.hint ? (
                        <span className="hidden truncate text-xs text-ink-faint sm:inline">
                          {item.hint}
                        </span>
                      ) : null}
                      {selected ? (
                        <CornerDownLeft
                          aria-hidden="true"
                          strokeWidth={ICON_STROKE}
                          className="size-3.5 text-ink-faint"
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
          <div className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-ink-faint sm:flex">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> to move
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> to open
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
