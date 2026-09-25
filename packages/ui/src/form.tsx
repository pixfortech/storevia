"use client";
// Form controls (docs/design/design-plan.md §5): Input, Textarea, Select,
// Field and SearchInput. Combobox and DateRangePicker have their own modules
// (combobox.tsx, date-range-picker.tsx), so a page with a plain field doesn't
// ship them.
//
// A client module because SearchInput keeps state and Field uses context; server components can still render every control here. Field's
// render-prop form (children as a function) needs a client parent, because
// functions can't cross the server/client boundary; from a server component,
// pass the control as a plain child and Field wires it through context.
import { CircleAlert, Search, X, type LucideIcon } from "lucide-react";
import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { Kbd } from "./data";
import { Icon } from "./icons";
import {
  BARE,
  CONTROL,
  FieldContext,
  splitSize,
  useFieldWiring,
  WRAPPED,
  type ControlSize,
  type FieldContextValue,
  type FieldRenderProps,
} from "./form-core";

export type { FieldRenderProps };

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
