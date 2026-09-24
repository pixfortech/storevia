"use client";
// Form controls (docs/design/design-plan.md §5): Input, Textarea, Select,
// Field, SearchInput, Combobox and DateRangePicker.
//
// A client module because SearchInput, Combobox and DateRangePicker keep
// state; server components can still render every control here. Field's
// render-prop form (children as a function) needs a client parent, because
// functions can't cross the server/client boundary; from a server component,
// pass the control as a plain child and Field wires it through context.
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, CircleAlert, Search, X, type LucideIcon } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { dateRangeBounds, type DateRangePreset, type DateRangeValue } from "./control-helpers";
import { SegmentedControl } from "./choice";
import { cn } from "./cn";
import { Kbd } from "./data";
import { Icon } from "./icons";

/* ----------------------------------------------------------------------------
 * Shared control styling
 * ------------------------------------------------------------------------- */

type ControlSize = "sm" | "md" | "lg";

const HEIGHT: Record<ControlSize, string> = { sm: "h-8", md: "h-10", lg: "h-12" };

/**
 * `size` is a height token, or (for code written against the native
 * attributes) a number, which passes through as the HTML `size` attribute.
 */
function splitSize(size: ControlSize | number | undefined): {
  height: string;
  native: number | undefined;
} {
  return typeof size === "number"
    ? { height: HEIGHT.md, native: size }
    : { height: HEIGHT[size ?? "md"], native: undefined };
}

// 16 px text on phones stops iOS zooming into a focused field; 14 px above.
// The boundary is line-control (3:1 on every surface, WCAG 1.4.11); a
// disabled field steps back to a hairline, since it takes no input.
const SURFACE = cn(
  "rounded-control border border-line-control bg-surface text-body text-ink shadow-xs sm:text-body-sm",
  "transition-[border-color,box-shadow,background-color] duration-(--duration-fast) ease-(--ease-standard)",
);

const CONTROL = cn(
  "block w-full px-3 placeholder:text-ink-faint",
  SURFACE,
  "hover:border-neutral-500",
  "focus:border-brand-500 focus:outline-hidden focus:ring-3 focus:ring-brand-100",
  "disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-subtle disabled:text-ink-faint disabled:shadow-none disabled:hover:border-line-strong",
  "aria-invalid:border-danger-500 aria-invalid:hover:border-danger-500 aria-invalid:focus:ring-danger-100",
);

// An adorned control: the wrapper draws the border and focus ring, the input
// inside is bare.
const WRAPPED = cn(
  "flex w-full items-center overflow-hidden",
  SURFACE,
  "hover:border-neutral-500",
  "focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100",
  // Forced colours drop the ring, and the frame clips the bare input's own
  // outline, so the frame draws the focus outline there.
  "forced-colors:focus-within:outline-2 forced-colors:focus-within:outline-offset-2",
  "has-disabled:cursor-not-allowed has-disabled:border-line-strong has-disabled:bg-subtle has-disabled:text-ink-faint has-disabled:shadow-none has-disabled:hover:border-line-strong",
  "has-[[aria-invalid=true]]:border-danger-500 has-[[aria-invalid=true]]:focus-within:ring-danger-100",
);

// w-0 + flex-1: the bare input takes the frame's free space instead of its
// ~20-character intrinsic width, so an adorned field never forces its column
// wider than the screen; min-w-16 keeps room to type in a shrink-to-fit parent.
const BARE =
  "h-full w-0 min-w-16 flex-1 bg-transparent px-3 text-inherit placeholder:text-ink-faint focus:outline-hidden disabled:cursor-not-allowed";

/* ----------------------------------------------------------------------------
 * Field context: lets a control inside <Field> pick up its id and aria wiring
 * ------------------------------------------------------------------------- */

export interface FieldRenderProps {
  /** Put on the control: the label points at it. */
  id: string;
  /** Put on the control as aria-describedby (description and error ids). */
  describedBy: string | undefined;
  /** Put on the control as aria-invalid. */
  invalid: boolean;
  required: boolean;
}

interface FieldContextValue extends FieldRenderProps {
  labelId: string;
}

const FieldContext = createContext<FieldContextValue | null>(null);

interface WirableProps {
  id?: string | undefined;
  required?: boolean | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: InputHTMLAttributes<HTMLInputElement>["aria-invalid"];
}

/** Field wiring for a control; explicit props always win. */
function useFieldWiring(props: WirableProps): WirableProps {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: props.id ?? field.id,
    required: props.required ?? (field.required || undefined),
    "aria-describedby": props["aria-describedby"] ?? field.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}

/* ----------------------------------------------------------------------------
 * Input
 * ------------------------------------------------------------------------- */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Height: sm 32, md 40 (default), lg 48 px. A number is the native `size` attribute. */
  size?: ControlSize | number | undefined;
  /** A Lucide icon inside the start of the field. */
  leadingIcon?: LucideIcon;
  /** Inline content at the end (a unit, a shortcut hint, a small button). */
  trailing?: ReactNode;
  /** A segment attached to the end, e.g. ".storevia.site" or "USD". */
  addon?: ReactNode;
}

/**
 * A text input. With an icon, trailing content or an addon, `className`
 * styles the outer frame (width, margins) rather than the bare input.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size, leadingIcon, trailing, addon, ...props },
  ref,
) {
  const wiring = useFieldWiring(props);
  const { height, native } = splitSize(size);
  const adorned =
    Boolean(leadingIcon) || (trailing !== undefined && trailing !== null) || Boolean(addon);
  if (!adorned) {
    return (
      <input
        ref={ref}
        size={native}
        className={cn(CONTROL, height, className)}
        {...props}
        {...wiring}
      />
    );
  }
  return (
    <div className={cn(WRAPPED, height, className)}>
      {leadingIcon ? <Icon icon={leadingIcon} size="sm" className="ml-3 text-ink-faint" /> : null}
      <input
        ref={ref}
        size={native}
        className={cn(
          BARE,
          leadingIcon && "pl-2.5",
          trailing !== undefined && trailing !== null && "pr-2",
        )}
        {...props}
        {...wiring}
      />
      {trailing !== undefined && trailing !== null ? (
        <span className="flex shrink-0 items-center pr-2 text-ink-faint">{trailing}</span>
      ) : null}
      {addon ? (
        <span className="flex h-full shrink-0 items-center border-l border-line-strong bg-subtle px-3 text-body-sm text-ink-muted">
          {addon}
        </span>
      ) : null}
    </div>
  );
});

/* ----------------------------------------------------------------------------
 * Textarea
 * ------------------------------------------------------------------------- */

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  const wiring = useFieldWiring(props);
  return (
    <textarea
      ref={ref}
      className={cn(CONTROL, "min-h-24 resize-y py-2.5 leading-relaxed", className)}
      {...props}
      {...wiring}
    />
  );
});

/* ----------------------------------------------------------------------------
 * Select (native)
 * ------------------------------------------------------------------------- */

// The chevron as a background image keeps Select a single element, so a
// caller's className (e.g. "h-9 w-44") sizes the whole control.
const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235F687C' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Height: sm 32, md 40 (default), lg 48 px. A number is the native `size` attribute. */
  size?: ControlSize | number | undefined;
}

// An option with an empty value is a placeholder ("Choose an industry"), as
// in the HTML spec's placeholder label option: while it is the selection the
// field shows it in faint ink, like an input's placeholder. The options
// themselves stay in ink.
const SELECT_PLACEHOLDER =
  "[&:has(option[value='']:checked)]:text-ink-faint [&_option]:text-ink [&_option:disabled]:text-ink-faint";

/** A native select with a drawn chevron. An option with value "" reads as the placeholder. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, size, style, ...props },
  ref,
) {
  const wiring = useFieldWiring(props);
  const { height, native } = splitSize(size);
  return (
    <select
      ref={ref}
      size={native}
      className={cn(
        CONTROL,
        height,
        "cursor-pointer appearance-none bg-size-[1rem] bg-position-[right_0.75rem_center] bg-no-repeat pr-9",
        SELECT_PLACEHOLDER,
        className,
      )}
      style={{ backgroundImage: SELECT_CHEVRON, ...style }}
      {...props}
      {...wiring}
    >
      {children}
    </select>
  );
});

/* ----------------------------------------------------------------------------
 * Field
 * ------------------------------------------------------------------------- */

export interface FieldProps {
  label: ReactNode;
  /**
   * The control. Either a node (Input, Select, Textarea, Combobox,
   * SearchInput pick up the wiring automatically) or a render function that
   * receives the ids to wire up by hand.
   */
  children: ReactNode | ((ids: FieldRenderProps) => ReactNode);
  /** Help text under the control. */
  description?: ReactNode;
  /** Older name for `description`. */
  hint?: ReactNode;
  /** Shown under the control with an icon; marks the control invalid. */
  error?: ReactNode;
  /** Adds an asterisk and marks the control required. */
  required?: boolean;
  /** Adds "Optional" beside the label. */
  optional?: boolean;
  /** Keeps the label for assistive tech only. */
  hideLabel?: boolean;
  /** Content at the end of the label row, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  /** The control's id (generated by default). */
  id?: string;
  className?: string;
}

/** Label + control + description + error, with the aria wiring done. */
export function Field({
  label,
  children,
  description,
  hint,
  error,
  required = false,
  optional = false,
  hideLabel = false,
  labelAside,
  id: idProp,
  className,
}: FieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const help = description ?? hint;
  const hasHelp = help !== undefined && help !== null && help !== false;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const helpId = hasHelp ? `${id}-description` : undefined;
  const errorId = hasError ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const labelId = `${id}-label`;
  const ids = useMemo<FieldContextValue>(
    () => ({ id, describedBy, invalid: hasError, required, labelId }),
    [id, describedBy, hasError, required, labelId],
  );
  // Help and error sit under the control, and content-start stops a field
  // stretching beside a taller neighbour, so controls in a row of fields
  // stay aligned whether or not each one has help text.
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <div className={cn("flex items-baseline justify-between gap-3", hideLabel && "sr-only")}>
        <label id={labelId} htmlFor={id} className="text-label text-ink">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-danger-600">
              *
            </span>
          ) : null}
          {optional && !required ? (
            <span className="ml-1.5 font-normal text-ink-faint">Optional</span>
          ) : null}
        </label>
        {labelAside ? <div className="shrink-0 text-label font-normal">{labelAside}</div> : null}
      </div>
      {typeof children === "function" ? (
        children({ id, describedBy, invalid: hasError, required })
      ) : (
        <FieldContext.Provider value={ids}>{children}</FieldContext.Provider>
      )}
      {hasHelp || hasError ? (
        <div className="grid gap-1">
          {hasHelp ? (
            <p id={helpId} className="text-label font-normal text-ink-muted">
              {help}
            </p>
          ) : null}
          {hasError ? (
            <p
              id={errorId}
              className="flex items-start gap-1.5 text-label font-normal text-danger-700"
            >
              <Icon icon={CircleAlert} size="xs" className="mt-0.5" />
              <span className="min-w-0">{error}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * SearchInput
 * ------------------------------------------------------------------------- */

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export interface SearchInputProps extends Omit<
  InputProps,
  "type" | "leadingIcon" | "trailing" | "addon"
> {
  /** Called after the clear button empties the field. */
  onClear?: () => void;
  /** A keyboard hint shown while empty, e.g. "⌘K" (hidden on phones). */
  shortcut?: ReactNode;
  /** Accessible name of the clear button. */
  clearLabel?: string;
}

/** A search field with an icon, a clear button and an optional shortcut hint. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { onClear, shortcut, clearLabel = "Clear search", value, defaultValue, onChange, ...props },
  ref,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [filled, setFilled] = useState(
    defaultValue !== undefined && String(defaultValue as string | number).length > 0,
  );
  const hasValue = value !== undefined ? String(value).length > 0 : filled;

  const clear = () => {
    const input = inputRef.current;
    if (!input) return;
    // Set the value the way a keystroke would, so React fires onChange for
    // controlled and uncontrolled use alike.
    Reflect.set(HTMLInputElement.prototype, "value", "", input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setFilled(false);
    input.focus();
    onClear?.();
  };

  let trailing: ReactNode = null;
  if (hasValue && !props.disabled && !props.readOnly) {
    trailing = (
      <button
        type="button"
        aria-label={clearLabel}
        onClick={clear}
        className={cn(
          "relative inline-flex size-6 items-center justify-center rounded-sm text-ink-faint",
          "transition-colors duration-(--duration-fast) hover:bg-muted hover:text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus",
          "pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5",
        )}
      >
        <Icon icon={X} size="sm" />
      </button>
    );
  } else if (shortcut) {
    // The same keycap as the command menu; hidden on phones, which have no keyboard.
    trailing = <Kbd className="pointer-events-none hidden sm:inline-flex">{shortcut}</Kbd>;
  }

  return (
    <Input
      ref={(node) => {
        inputRef.current = node;
        assignRef(ref, node);
      }}
      type="search"
      leadingIcon={Search}
      trailing={trailing}
      {...(value !== undefined ? { value } : {})}
      {...(defaultValue !== undefined ? { defaultValue } : {})}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        if (value === undefined) setFilled(event.currentTarget.value.length > 0);
        onChange?.(event);
      }}
      {...props}
      className={cn(
        "[&_input::-webkit-search-cancel-button]:appearance-none [&_input::-webkit-search-decoration]:appearance-none",
        props.className,
      )}
    />
  );
});

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

/* ----------------------------------------------------------------------------
 * DateRangePicker
 * ------------------------------------------------------------------------- */

// DateRangePreset, DateRangeValue and dateRangeBounds live in button.tsx
// (server-safe), so server components can compute a range's bounds.

const PRESET_LABELS: Record<DateRangePreset, { short: string; long: string }> = {
  "7d": { short: "7d", long: "Last 7 days" },
  "30d": { short: "30d", long: "Last 30 days" },
  "90d": { short: "90d", long: "Last 90 days" },
  "12m": { short: "12m", long: "Last 12 months" },
};

export interface DateRangePickerProps {
  value?: DateRangeValue;
  /** Uncontrolled starting value. Default: last 30 days. */
  defaultValue?: DateRangeValue;
  onValueChange?: (value: DateRangeValue) => void;
  /** Which presets to offer, in order. */
  presets?: readonly DateRangePreset[];
  /** Offer "Custom" with two date inputs. Default true. */
  allowCustom?: boolean;
  /** Earliest and latest selectable dates for the custom range (yyyy-mm-dd). */
  min?: string;
  max?: string;
  size?: "sm" | "md";
  /** Names the control. Default "Date range". */
  "aria-label"?: string;
  className?: string;
}

/**
 * Period presets (7d / 30d / 90d / 12m) plus a custom range with native date
 * inputs. The value is a preset or a from/to pair; dateRangeBounds() turns
 * either into inclusive dates, on the server too.
 */
export function DateRangePicker({
  value,
  defaultValue = { preset: "30d" },
  onValueChange,
  presets = ["7d", "30d", "90d", "12m"],
  allowCustom = true,
  min,
  max,
  size = "md",
  "aria-label": ariaLabel = "Date range",
  className,
}: DateRangePickerProps) {
  const [inner, setInner] = useState<DateRangeValue>(defaultValue);
  const current = value ?? inner;
  const fromId = useId();
  const toId = useId();

  const update = (next: DateRangeValue) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  const options = [
    ...presets.map((preset) => ({
      value: preset,
      label: PRESET_LABELS[preset].short,
      "aria-label": PRESET_LABELS[preset].long,
    })),
    ...(allowCustom ? [{ value: "custom", label: "Custom" }] : []),
  ];

  return (
    // Controls inside must not take a surrounding Field's single id.
    <FieldContext.Provider value={null}>
      <div
        role="group"
        aria-label={ariaLabel}
        className={cn("flex flex-wrap items-center gap-2", className)}
      >
        <SegmentedControl
          aria-label="Period"
          size={size}
          options={options}
          value={current.preset}
          onValueChange={(next) => {
            if (next === "custom") {
              // Start the custom range from the period in view.
              update({ preset: "custom", ...dateRangeBounds(current) });
            } else {
              update({ preset: next as DateRangePreset });
            }
          }}
        />
        {current.preset === "custom" ? (
          <div className="flex min-w-0 animate-fade-in items-center gap-2">
            <label htmlFor={fromId} className="sr-only">
              From
            </label>
            <Input
              id={fromId}
              type="date"
              size={size}
              value={current.from}
              min={min}
              max={current.to || max}
              onChange={(event) => {
                update({ ...current, from: event.currentTarget.value });
              }}
              className="w-[9.5rem] min-w-0 tabular-nums"
            />
            <span aria-hidden="true" className="text-ink-faint">
              –
            </span>
            <label htmlFor={toId} className="sr-only">
              To
            </label>
            <Input
              id={toId}
              type="date"
              size={size}
              value={current.to}
              min={current.from || min}
              max={max}
              onChange={(event) => {
                update({ ...current, to: event.currentTarget.value });
              }}
              className="w-[9.5rem] min-w-0 tabular-nums"
            />
          </div>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
