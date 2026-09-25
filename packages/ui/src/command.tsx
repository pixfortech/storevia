"use client";

// Command menu (docs/architecture/12-design-system.md §7): a keyboard-first
// jump list. It only lists destinations the caller passes in, which are real,
// permission-filtered routes; it never invents actions. The static preview is
// in command-preview.tsx (server-safe).
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "./cn";
import {
  openingOrigin,
  registerLayerReturn,
  restoreFocus,
  type FocusResolver,
} from "./overlays-focus";
import {
  CommandEmpty,
  CommandFooter,
  CommandRow,
  commandResults,
  GROUP_LABEL,
  PANEL,
  resultCount,
  SearchRow,
  type CommandItem,
} from "./command-parts";

export { commandResults, type CommandGroup, type CommandItem } from "./command-parts";

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
