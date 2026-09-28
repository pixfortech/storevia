"use client";

import { IconButton } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import {
  cleanTag,
  normaliseTags,
  PRODUCT_TAG_LIMIT,
  PRODUCT_TAG_MAX_LENGTH,
  tagKey,
} from "@storevia/validation/tags";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { suggestTagsAction } from "@/app/(app)/s/[storeId]/products/actions";

// Tags as removable chips (09-commerce.md "Tags"). Type and press Enter or a
// comma to add one; pasting "a, b, c" adds three; leaving the field adds what
// was typed. Suggestions are tags this store already uses (ARIA 1.2 combobox
// with list autocomplete: arrow keys move, Enter picks, Escape closes).
// Every chip is a hidden "tags" field of the form named by `form`; the server
// applies the same normalisation (packages/validation/src/tags.ts) again.

export function TagsInput({
  storeId,
  form,
  label = "Tags",
  defaultTags,
  error,
  disabled = false,
  onChange,
}: {
  storeId: string;
  /** The id of the form the hidden values belong to. */
  form: string;
  label?: string;
  defaultTags: readonly string[];
  /** A server-side error for the field. */
  error?: string | undefined;
  disabled?: boolean;
  /** Called whenever the tags (or the text being typed) change. */
  onChange?: () => void;
}) {
  const id = useId();
  const inputId = `${id}-input`;
  const listboxId = `${id}-suggestions`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [tags, setTags] = useState<string[]>(() => [...defaultTags]);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /** What to fetch suggestions for; null when the list isn't wanted. */
  const [query, setQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  const chosen = new Set(tags.map(tagKey));
  const visible = suggestions.filter((s) => !chosen.has(tagKey(s)));
  const shown = open && visible.length > 0;
  const message = problem ?? error;

  // Suggestions follow the typing, once it pauses; stale answers are dropped.
  useEffect(() => {
    if (query === null) return;
    const ticket = (request.current += 1);
    const timer = setTimeout(() => {
      void suggestTagsAction(storeId, query).then((result) => {
        if (ticket !== request.current) return;
        setSuggestions(result.ok ? result.data : []);
        setActive(-1);
      });
    }, 150);
    return () => {
      clearTimeout(timer);
    };
  }, [query, storeId]);

  const changed = () => {
    onChange?.();
  };

  /** Adds raw text (one tag, or several separated by commas). Returns whether it all fitted. */
  const add = (raw: string): boolean => {
    const incoming = normaliseTags(raw).tags;
    if (incoming.length === 0) return true;
    const next = normaliseTags([...tags, ...incoming]);
    if (next.problem) {
      setProblem(next.problem);
      return false;
    }
    const added = next.tags.slice(tags.length);
    setTags(next.tags);
    setProblem(null);
    if (added.length > 0) {
      setAnnouncement(
        added.length === 1 ? `Added tag ${added[0] ?? ""}.` : `Added ${String(added.length)} tags.`,
      );
    }
    changed();
    return true;
  };

  const remove = (tag: string) => {
    setTags((current) => current.filter((t) => t !== tag));
    setProblem(null);
    setAnnouncement(`Removed tag ${tag}.`);
    changed();
    inputRef.current?.focus();
  };

  const commitDraft = () => {
    if (!cleanTag(draft)) {
      setDraft("");
      return;
    }
    if (add(draft)) setDraft("");
  };

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const pick = (tag: string) => {
    if (add(tag)) setDraft("");
    close();
    setQuery(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "Enter": {
        // Never submits the form from here: Enter adds a tag.
        event.preventDefault();
        const option = shown && active >= 0 ? visible[active] : undefined;
        if (option) pick(option);
        else {
          commitDraft();
          close();
        }
        return;
      }
      case ",": {
        event.preventDefault();
        commitDraft();
        close();
        return;
      }
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setQuery(draft);
          return;
        }
        const count = visible.length;
        if (count === 0) return;
        setActive((current) =>
          event.key === "ArrowDown"
            ? (current + 1) % count
            : current <= 0
              ? count - 1
              : current - 1,
        );
        return;
      }
      case "Escape": {
        if (shown) {
          event.preventDefault();
          close();
        }
        return;
      }
      case "Backspace": {
        // An empty field steps back into the chips: remove the last one.
        const last = tags.at(-1);
        if (draft === "" && last !== undefined) {
          event.preventDefault();
          remove(last);
        }
        return;
      }
      default:
    }
  };

  return (
    <div className="grid content-start gap-2">
      <label htmlFor={inputId} className="text-label text-ink">
        {label}
      </label>
      <input type="hidden" name="tagsPresent" value="1" form={form} disabled={disabled} />
      {tags.map((tag) => (
        <input key={tag} type="hidden" name="tags" value={tag} form={form} disabled={disabled} />
      ))}
      {/* Text still being typed is sent too (the server normalises it). */}
      {draft.trim() ? (
        <input type="hidden" name="tags" value={draft} form={form} disabled={disabled} />
      ) : null}
      <div
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-control border border-line-control bg-surface px-2 py-1.5 text-body text-ink shadow-xs sm:text-body-sm",
          "transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-neutral-500",
          "focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100",
          "forced-colors:focus-within:outline-2 forced-colors:focus-within:outline-offset-2",
          message && "border-danger-500 hover:border-danger-500 focus-within:ring-danger-100",
          disabled && "cursor-not-allowed border-line-strong bg-subtle text-ink-faint shadow-none",
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        {tags.length > 0 ? (
          <ul className="contents" aria-label={`${label} added`}>
            {tags.map((tag) => (
              <li
                key={tag}
                className="flex max-w-full items-center gap-0.5 rounded-pill border border-line bg-subtle py-0.5 pr-0.5 pl-2.5 text-body-sm text-ink"
              >
                <span className="min-w-0 truncate">{tag}</span>
                {disabled ? null : (
                  <IconButton
                    size="sm"
                    icon={X}
                    aria-label={`Remove tag ${tag}`}
                    className="size-6"
                    onClick={() => {
                      remove(tag);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="relative min-w-32 flex-1">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={shown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              shown && active >= 0 ? `${listboxId}-${String(active)}` : undefined
            }
            aria-describedby={message ? `${hintId} ${errorId}` : hintId}
            aria-invalid={message ? true : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="enter"
            disabled={disabled}
            placeholder={tags.length >= PRODUCT_TAG_LIMIT ? undefined : "Add tag…"}
            value={draft}
            maxLength={PRODUCT_TAG_MAX_LENGTH * 20}
            className="h-7 w-full bg-transparent px-1 placeholder:text-ink-faint focus:outline-hidden disabled:cursor-not-allowed"
            onChange={(event) => {
              const text = event.currentTarget.value;
              setDraft(text);
              setProblem(null);
              setOpen(text.trim() !== "");
              setQuery(text.trim() === "" ? null : cleanTag(text));
              changed();
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!/[,\n\r]/.test(text)) return;
              // "a, b, c" or one per line: every part becomes a chip.
              event.preventDefault();
              if (add(`${draft}${text.replace(/[\r\n]+/g, ",")}`)) setDraft("");
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              commitDraft();
              close();
            }}
          />
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`${label} used in this store`}
            hidden={!shown}
            className="absolute top-full left-0 z-(--z-popover) mt-2 max-h-64 w-64 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-popover"
            onMouseDown={(event) => {
              // Picking must not blur the field (which would add the draft).
              event.preventDefault();
            }}
          >
            {visible.map((tag, index) => (
              <li
                key={tag}
                id={`${listboxId}-${String(index)}`}
                role="option"
                aria-selected={index === active}
                data-active={index === active || undefined}
                onClick={() => {
                  pick(tag);
                }}
                onPointerMove={() => {
                  if (index !== active) setActive(index);
                }}
                className="flex min-h-9 cursor-pointer items-center rounded-sm px-2.5 py-1.5 text-body-sm text-ink data-active:bg-subtle forced-colors:data-active:outline-1"
              >
                <span className="truncate">{tag}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid gap-1">
        <p id={hintId} className="text-label font-normal text-ink-muted">
          Press Enter or type a comma to add a tag. Up to {PRODUCT_TAG_LIMIT} tags of{" "}
          {PRODUCT_TAG_MAX_LENGTH} characters each.
        </p>
        {message ? (
          <p id={errorId} className="text-label font-normal text-danger-700">
            {message}
          </p>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
