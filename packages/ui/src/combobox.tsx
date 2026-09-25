"use client";
// Combobox (docs/design/design-plan.md §5): a searchable single select on a
// Radix Popover. Its own module so plain form fields don't ship the popover.
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Icon } from "./icons";
import { BARE, FieldContext, HEIGHT, WRAPPED, type ControlSize } from "./form-core";

/* ----------------------------------------------------------------------------
 * Combobox
 * ------------------------------------------------------------------------- */

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Extra words the filter matches (e.g. a country's code). */
  keywords?: readonly string[];
}

export interface ComboboxProps {
  options: readonly ComboboxOption[];
  /** Controlled value (null for none). */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  /** Shown when nothing matches. */
  emptyMessage?: ReactNode;
  /** Custom matching; the default is a case- and accent-insensitive substring match. */
  filter?: (option: ComboboxOption, query: string) => boolean;
  size?: ControlSize;
  /** Submits the value with a form (hidden input). */
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

function normalise(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function defaultComboboxFilter(option: ComboboxOption, query: string): boolean {
  const needle = normalise(query);
  if (!needle) return true;
  return [option.label, ...(option.keywords ?? [])].some((text) =>
    normalise(text).includes(needle),
  );
}

function firstEnabled(options: readonly ComboboxOption[], from = 0, step = 1): number {
  const count = options.length;
  for (let i = 0; i < count; i += 1) {
    const index = (((from + i * step) % count) + count) % count;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

/** The label with the first match of the query in semibold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = normalise(query);
  const at = needle ? normalise(text).indexOf(needle) : -1;
  // Accent stripping can change lengths; only highlight when it didn't.
  if (at < 0 || normalise(text).length !== text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-ink">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}

/**
 * A text input that filters a list of options (ARIA 1.2 combobox with list
 * autocomplete). Arrow keys move through matches, Enter picks, Escape closes.
 *
 * The list opens in a portal (a Radix Popover anchored to the field), so the
 * scrolling body of a Dialog, Drawer or Sheet can't clip it, and Escape
 * closes the list before it closes the overlay. Focus never leaves the input.
 */

// Inside a dialog the list is portaled into the dialog element rather than
// <body>: a modal dialog's scroll lock only lets wheel and touch scrolling
// through inside its own content. The list is position: fixed, so the
// dialog's scrolling body still can't clip it.
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

export function Combobox({
  options,
  value,
  defaultValue = null,
  onValueChange,
  placeholder,
  emptyMessage = "No matches",
  filter = defaultComboboxFilter,
  size = "md",
  name,
  id: idProp,
  disabled = false,
  required,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const field = useContext(FieldContext);
  const autoId = useId();
  const id = idProp ?? field?.id ?? autoId;
  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${String(index)}`;

  const [open, setOpen] = useState(false);
  const [portalTo, setPortalTo] = useState<HTMLElement | null>(null);
  // null: not typing, so the input shows the selected option's label.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [innerValue, setInnerValue] = useState<string | null>(defaultValue);
  const selectedValue = value !== undefined ? value : innerValue;
  const selected = options.find((option) => option.value === selectedValue) ?? null;

  const filterOptions = useCallback(
    (text: string | null) => (text ? options.filter((option) => filter(option, text)) : options),
    [options, filter],
  );
  const matches = useMemo(() => filterOptions(query), [filterOptions, query]);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const frameRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && active >= 0) optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const close = () => {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  };

  const commit = (next: string | null) => {
    if (value === undefined) setInnerValue(next);
    if (next !== selectedValue) onValueChange?.(next);
    close();
  };

  const show = () => {
    setPortalTo(frameRef.current?.closest<HTMLElement>(DIALOG_SELECTOR) ?? null);
    setOpen(true);
  };

  const openList = (direction: 1 | -1) => {
    const list = filterOptions(query);
    const current = list.findIndex((option) => option.value === selectedValue);
    show();
    setActive(
      current >= 0 ? current : firstEnabled(list, direction === 1 ? 0 : list.length - 1, direction),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        if (!open || event.altKey) {
          openList(step);
          return;
        }
        if (matches.length === 0) return;
        setActive((current) => {
          const from = current >= 0 ? current + step : step === 1 ? 0 : matches.length - 1;
          return firstEnabled(matches, from, step);
        });
        return;
      }
      case "Enter": {
        const option = open && active >= 0 ? matches[active] : undefined;
        if (option && !option.disabled) {
          event.preventDefault();
          commit(option.value);
        }
        return;
      }
      case "Escape": {
        if (open) {
          event.preventDefault();
          close();
        } else if (query !== null) {
          setQuery(null);
        }
        return;
      }
      default:
    }
  };

  const invalid = ariaInvalid ?? field?.invalid ?? false;
  const describedBy = ariaDescribedBy ?? field?.describedBy;
  const labelledBy = ariaLabelledBy ?? (ariaLabel ? undefined : field?.labelId);

  const listbox = (options: { placeholder: boolean }) => ({
    id: listboxId,
    role: "listbox",
    "aria-label": ariaLabel,
    "aria-labelledby": labelledBy,
    ...(options.placeholder ? { hidden: true } : {}),
  });

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <div className={cn("relative", className)}>
        <PopoverPrimitive.Anchor asChild>
          <div ref={frameRef} className={cn(WRAPPED, HEIGHT[size])}>
            <input
              ref={inputRef}
              id={id}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
              aria-label={ariaLabel}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required={(required ?? field?.required) ? true : undefined}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              placeholder={placeholder}
              value={query ?? selected?.label ?? ""}
              onChange={(event) => {
                const text = event.currentTarget.value;
                setQuery(text);
                show();
                setActive(firstEnabled(filterOptions(text)));
              }}
              onClick={() => {
                if (!open) openList(1);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => {
                // Emptying the text and leaving the field clears the choice.
                if (query === "") commit(null);
                else close();
              }}
              className={BARE}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label="Show options"
              aria-expanded={open}
              aria-controls={listboxId}
              disabled={disabled}
              onPointerDown={(event) => {
                // Keep focus in the input; toggle from here.
                event.preventDefault();
                if (open) close();
                else {
                  openList(1);
                  inputRef.current?.focus();
                }
              }}
              className="relative mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-faint transition-colors duration-(--duration-fast) hover:bg-muted hover:text-ink disabled:pointer-events-none pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
            >
              <Icon
                icon={ChevronDown}
                size="sm"
                className={cn(
                  "transition-transform duration-(--duration-base) ease-(--ease-standard)",
                  open && "rotate-180",
                )}
              />
            </button>
          </div>
        </PopoverPrimitive.Anchor>
        {name ? <input type="hidden" name={name} value={selectedValue ?? ""} /> : null}
        {/* aria-controls always needs its listbox. While closed an empty one
            stands in; the real list only exists in the portal while open. */}
        {open ? null : <ul {...listbox({ placeholder: true })} />}
      </div>
      <PopoverPrimitive.Portal {...(portalTo ? { container: portalTo } : {})}>
        <PopoverPrimitive.Content
          // A positioned panel, not a dialog: focus stays in the input.
          role="presentation"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          hideWhenDetached
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            // The field and its chevron manage the list themselves.
            if (event.target instanceof Node && frameRef.current?.contains(event.target)) {
              event.preventDefault();
            }
          }}
          onMouseDown={(event) => {
            // Clicking an option, the padding or the scrollbar mustn't blur the input.
            event.preventDefault();
          }}
          className={cn(
            "z-(--z-popover) w-(--radix-popover-trigger-width) overflow-hidden rounded-card border border-line bg-surface shadow-popover outline-none",
            "origin-(--radix-popover-content-transform-origin) data-[state=open]:animate-[scale-in_var(--duration-fast)_var(--ease-emphasised)]",
          )}
        >
          <ul
            {...listbox({ placeholder: false })}
            className="max-h-[min(16rem,calc(var(--radix-popover-content-available-height,16rem)_-_0.75rem))] overflow-y-auto overscroll-contain p-1"
          >
            {matches.map((option, index) => {
              const isSelected = option.value === selectedValue;
              return (
                <li
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled ? true : undefined}
                  data-active={index === active || undefined}
                  onPointerDown={(event) => {
                    event.preventDefault();
                  }}
                  onPointerMove={() => {
                    if (!option.disabled && index !== active) setActive(index);
                  }}
                  onClick={() => {
                    if (!option.disabled) commit(option.value);
                  }}
                  className={cn(
                    "relative flex min-h-9 cursor-pointer select-none items-center rounded-sm py-1.5 pr-9 pl-2.5 text-body-sm text-ink",
                    "data-active:bg-subtle aria-disabled:cursor-not-allowed aria-disabled:text-ink-faint",
                    // Forced colours drop the fill; an outline marks the active option.
                    "forced-colors:data-active:outline-1 forced-colors:data-active:-outline-offset-1",
                    isSelected && "font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <Highlight text={option.label} query={query ?? ""} />
                    </span>
                    {option.description ? (
                      <span className="block truncate text-caption font-normal text-ink-muted">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <Icon icon={Check} size="sm" className="absolute right-2.5 text-brand-600" />
                  ) : null}
                </li>
              );
            })}
          </ul>
          {/* In the DOM from the moment the list opens, so "No matches" is announced. */}
          <p
            role="status"
            className={
              matches.length === 0 ? "px-3.5 pt-1 pb-3 text-body-sm text-ink-faint" : "sr-only"
            }
          >
            {matches.length === 0 ? emptyMessage : null}
          </p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
