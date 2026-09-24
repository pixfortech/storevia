"use client";
// Choice controls: ChoiceCards, Checkbox, RadioGroup, Switch and
// SegmentedControl (docs/design/design-plan.md §4–5). Radix supplies keyboard
// behaviour, roles and form participation; brand blue marks the selection.
//
// Boundaries that identify a control (box, circle, track) use line-control,
// 3:1 on every surface. Forced-colours mode drops fills and shadows, so each
// state also has a border or outline there.
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, Minus, type LucideIcon } from "lucide-react";
import { useId, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icons";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/* ----------------------------------------------------------------------------
 * ChoiceCards
 * ------------------------------------------------------------------------- */

export interface ChoiceOption {
  readonly value: string;
  readonly title: string;
  readonly description?: string;
  readonly visual?: ReactNode;
  readonly disabled?: boolean;
}

export interface ChoiceCardsProps {
  name: string;
  legend: string;
  options: readonly ChoiceOption[];
  defaultValue?: string;
  columns?: 1 | 2 | 3 | 4;
  error?: string;
  onChange?: (value: string) => void;
  /** Visually hides the legend (it still names the group). */
  hideLegend?: boolean;
  className?: string;
}

// Accessible choice cards: a radio group styled as cards (e.g. the
// business-type selector). Native radios keep keyboard and form behaviour.
export function ChoiceCards({
  name,
  legend,
  options,
  defaultValue,
  columns = 2,
  error,
  onChange,
  hideLegend = false,
  className,
}: ChoiceCardsProps) {
  const errorId = useId();
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      className={className}
    >
      <legend className={cn("text-body font-semibold text-ink", hideLegend && "sr-only")}>
        {legend}
      </legend>
      <div
        className={cn(
          "grid gap-3",
          !hideLegend && "mt-3",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
          columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "group relative flex cursor-pointer gap-3.5 rounded-card border border-line bg-surface p-4 pr-11 shadow-xs",
              "transition-[border-color,box-shadow,background-color] duration-(--duration-fast) ease-(--ease-standard)",
              "hover:border-line-strong hover:shadow-raised",
              "has-checked:border-brand-500 has-checked:bg-brand-25 has-checked:shadow-[0_0_0_1px_var(--color-brand-500)]",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
              "has-disabled:cursor-not-allowed has-disabled:opacity-55 has-disabled:hover:shadow-xs",
              error && "border-danger-500/50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
              disabled={option.disabled}
              onChange={() => onChange?.(option.value)}
              // Transparent but full-size: the whole card is the hit target,
              // and assistive tech and automation see a real, visible radio.
              className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-card opacity-0 disabled:cursor-not-allowed"
            />
            {option.visual}
            <span className="min-w-0">
              <span className="block text-body-sm font-semibold text-ink">{option.title}</span>
              {option.description ? (
                <span className="mt-1 block text-body-sm text-ink-muted">{option.description}</span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-4 right-4 inline-flex size-5 items-center justify-center rounded-full border border-line-control bg-surface text-white",
                "transition-colors duration-(--duration-fast)",
                "peer-checked:border-brand-600 peer-checked:bg-brand-600",
              )}
            >
              <Icon
                icon={Check}
                size="xs"
                strokeWidth={3}
                className="size-3 scale-50 opacity-0 transition-[opacity,scale] duration-(--duration-base) ease-(--ease-emphasised) group-has-checked:scale-100 group-has-checked:opacity-100"
              />
            </span>
          </label>
        ))}
      </div>
      {error ? <ChoiceError id={errorId}>{error}</ChoiceError> : null}
    </fieldset>
  );
}

function ChoiceError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 text-label font-normal text-danger-700">
      {children}
    </p>
  );
}

/* ----------------------------------------------------------------------------
 * Shared label layout for Checkbox, RadioItem and Switch
 * ------------------------------------------------------------------------- */

function ChoiceLabel({
  htmlFor,
  label,
  description,
  descriptionId,
  disabled,
}: {
  htmlFor: string;
  label: ReactNode;
  description?: ReactNode;
  descriptionId: string | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <label
        htmlFor={htmlFor}
        className={cn(
          "cursor-pointer text-body-sm font-medium text-ink",
          disabled && "cursor-not-allowed text-ink-faint",
        )}
      >
        {label}
      </label>
      {description ? (
        <span id={descriptionId} className="text-body-sm text-ink-muted">
          {description}
        </span>
      ) : null}
    </span>
  );
}

function joinIds(...ids: (string | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

/* ----------------------------------------------------------------------------
 * Checkbox
 * ------------------------------------------------------------------------- */

export interface CheckboxProps extends Omit<
  ComponentPropsWithRef<typeof CheckboxPrimitive.Root>,
  "children"
> {
  /** Visible label, wired to the box. Without it, pass aria-label. */
  label?: ReactNode;
  description?: ReactNode;
}

const BOX = cn(
  "group relative inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-line-control bg-surface text-white shadow-xs",
  "transition-[background-color,border-color] duration-(--duration-fast) ease-(--ease-standard)",
  "hover:border-neutral-500",
  "data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600",
  "data-[state=indeterminate]:border-brand-600 data-[state=indeterminate]:bg-brand-600",
  "aria-invalid:border-danger-500",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-control",
  // 44 px tap area on touch screens (measured from inside the 1 px border).
  "pointer-coarse:after:absolute pointer-coarse:after:-inset-[15px]",
  FOCUS_RING,
);

/** A checkbox with an optional label and description. `checked="indeterminate"` shows a dash. */
export function Checkbox({ label, description, id, className, ...props }: CheckboxProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const box = (
    <CheckboxPrimitive.Root
      id={controlId}
      className={cn(BOX, !label && className)}
      {...props}
      aria-describedby={joinIds(props["aria-describedby"], descriptionId)}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Icon
          icon={Check}
          size="xs"
          strokeWidth={3}
          className="size-3 group-data-[state=indeterminate]:hidden"
        />
        <Icon
          icon={Minus}
          size="xs"
          strokeWidth={3}
          className="hidden size-3 group-data-[state=indeterminate]:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!label) return box;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="flex h-[1.3125rem] items-center">{box}</span>
      <ChoiceLabel
        htmlFor={controlId}
        label={label}
        description={description}
        descriptionId={descriptionId}
        disabled={props.disabled}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * RadioGroup / RadioItem
 * ------------------------------------------------------------------------- */

export type RadioGroupProps = ComponentPropsWithRef<typeof RadioGroupPrimitive.Root>;

/** A single choice from a short list. Arrow keys move between items. */
export function RadioGroup({ className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      className={cn(
        "grid gap-3 data-[orientation=horizontal]:flex data-[orientation=horizontal]:flex-wrap data-[orientation=horizontal]:gap-x-6",
        className,
      )}
      {...props}
    />
  );
}

export interface RadioItemProps extends Omit<
  ComponentPropsWithRef<typeof RadioGroupPrimitive.Item>,
  "children"
> {
  label?: ReactNode;
  description?: ReactNode;
}

const RADIO = cn(
  "relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line-control bg-surface shadow-xs",
  "transition-[background-color,border-color] duration-(--duration-fast) ease-(--ease-standard)",
  "hover:border-neutral-500",
  "data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-control",
  "pointer-coarse:after:absolute pointer-coarse:after:-inset-[15px]",
  FOCUS_RING,
);

export function RadioItem({ label, description, id, className, ...props }: RadioItemProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const radio = (
    <RadioGroupPrimitive.Item
      id={controlId}
      className={cn(RADIO, !label && className)}
      {...props}
      aria-describedby={joinIds(props["aria-describedby"], descriptionId)}
    >
      {/* The dot is drawn by a transparent border over its own fill, so
          forced-colours mode (which drops fills) still paints it. */}
      <RadioGroupPrimitive.Indicator className="size-1.5 rounded-full border-3 border-transparent bg-white" />
    </RadioGroupPrimitive.Item>
  );
  if (!label) return radio;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="flex h-[1.3125rem] items-center">{radio}</span>
      <ChoiceLabel
        htmlFor={controlId}
        label={label}
        description={description}
        descriptionId={descriptionId}
        disabled={props.disabled}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Switch
 * ------------------------------------------------------------------------- */

export interface SwitchProps extends Omit<
  ComponentPropsWithRef<typeof SwitchPrimitive.Root>,
  "children"
> {
  label?: ReactNode;
  description?: ReactNode;
  /** "end" (default): switch then label. "start": label left, switch right, as in settings rows. */
  labelPosition?: "start" | "end";
}

// Off is a line-control track (3.5:1 on white, and the white thumb 3.5:1 on
// it); on is brand. In forced colours the track is outlined and "on" fills
// with Highlight, as native Windows switches do.
const TRACK = cn(
  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill border border-transparent bg-line-control p-px",
  "transition-colors duration-(--duration-base) ease-(--ease-standard)",
  "hover:bg-neutral-500 data-[state=checked]:bg-brand-600 data-[state=checked]:hover:bg-brand-700",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-line-control disabled:data-[state=checked]:hover:bg-brand-600",
  // 44 × 44 on touch screens (measured from inside the 1 px border).
  "pointer-coarse:after:absolute pointer-coarse:after:-inset-y-[13px] pointer-coarse:after:-inset-x-[5px]",
  FOCUS_RING,
  "forced-colors:forced-color-adjust-none forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]",
  "forced-colors:data-[state=checked]:border-[Highlight] forced-colors:data-[state=checked]:bg-[Highlight]",
  "forced-colors:disabled:border-[GrayText] forced-colors:focus-visible:outline-[Highlight]",
);

const THUMB = cn(
  "pointer-events-none block size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(11_21_48/0.24),0_0_0_0.5px_rgb(11_21_48/0.06)]",
  "transition-transform duration-(--duration-base) ease-(--ease-standard) data-[state=checked]:translate-x-4",
  "forced-colors:bg-[CanvasText] forced-colors:shadow-none forced-colors:data-[state=checked]:bg-[HighlightText] forced-colors:data-disabled:bg-[GrayText]",
);

/** An on/off setting that applies immediately (36 × 20 track). */
export function Switch({
  label,
  description,
  labelPosition = "end",
  id,
  className,
  ...props
}: SwitchProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const control = (
    <SwitchPrimitive.Root
      id={controlId}
      className={cn(TRACK, !label && className)}
      {...props}
      aria-describedby={joinIds(props["aria-describedby"], descriptionId)}
    >
      <SwitchPrimitive.Thumb className={THUMB} />
    </SwitchPrimitive.Root>
  );
  if (!label) return control;
  const text = (
    <ChoiceLabel
      htmlFor={controlId}
      label={label}
      description={description}
      descriptionId={descriptionId}
      disabled={props.disabled}
    />
  );
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        labelPosition === "start" && "justify-between gap-6",
        className,
      )}
    >
      {labelPosition === "start" ? text : null}
      <span className="flex h-[1.3125rem] items-center">{control}</span>
      {labelPosition === "end" ? text : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * SegmentedControl
 * ------------------------------------------------------------------------- */

export interface SegmentedControlOption {
  value: string;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Needed when the label is only an icon. */
  "aria-label"?: string;
}

export interface SegmentedControlProps {
  options: readonly SegmentedControlOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** sm 32 px, md 40 px (default). */
  size?: "sm" | "md";
  /** Stretch to the container; segments stay equal. */
  fullWidth?: boolean;
  disabled?: boolean;
  /** Submits the value with a form. */
  name?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * One choice from 2–5 short options, e.g. a view or period switch. Radio
 * semantics (arrow keys move and select). Segments are equal width, so the
 * selected pill slides by whole segments with no measuring.
 *
 * The track and the selected pill both carry a line-control border: the
 * track identifies the control and the pill its state, each at 3:1, and the
 * pill's border is what forced-colours mode shows. On touch screens every
 * segment is at least 44 × 44.
 */
export function SegmentedControl({
  options,
  value,
  defaultValue,
  onValueChange,
  size = "md",
  fullWidth = false,
  disabled,
  name,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SegmentedControlProps) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const index = options.findIndex((option) => option.value === current);
  return (
    <RadioGroupPrimitive.Root
      value={current}
      onValueChange={(next) => {
        if (value === undefined) setInner(next);
        onValueChange?.(next);
      }}
      orientation="horizontal"
      loop
      {...(disabled !== undefined ? { disabled } : {})}
      {...(name !== undefined ? { name } : {})}
      {...(id !== undefined ? { id } : {})}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "relative isolate grid-flow-col auto-cols-fr rounded-control border border-line-control bg-muted p-[3px]",
        fullWidth ? "grid w-full" : "inline-grid max-w-full",
        disabled && "opacity-55",
        className,
      )}
    >
      {index >= 0 ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-[3px] left-[3px] rounded-[5px] border border-line-control bg-surface shadow-xs transition-transform duration-(--duration-base) ease-(--ease-standard)"
          style={{
            width: `calc((100% - 6px) / ${String(options.length)})`,
            transform: `translateX(${String(index * 100)}%)`,
          }}
        />
      ) : null}
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          {...(option.disabled !== undefined ? { disabled: option.disabled } : {})}
          aria-label={option["aria-label"]}
          className={cn(
            "relative z-10 inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] font-medium text-ink-muted",
            "transition-colors duration-(--duration-fast) ease-(--ease-standard)",
            "hover:text-ink data-[state=checked]:text-ink",
            "disabled:cursor-not-allowed disabled:text-ink-faint/70 disabled:hover:text-ink-faint/70",
            size === "sm" ? "h-6 px-2.5 text-label" : "h-8 px-3 text-body-sm",
            "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus",
            // Touch: at least 44 wide, and an invisible 44 px tall hit area.
            "pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0",
            size === "sm"
              ? "pointer-coarse:after:-inset-y-2.5"
              : "pointer-coarse:after:-inset-y-1.5",
          )}
        >
          {option.icon ? <Icon icon={option.icon} size="sm" /> : null}
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
