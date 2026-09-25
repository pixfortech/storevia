"use client";
// Choice controls: Checkbox, RadioGroup and Switch (docs/design/design-plan.md
// §4–5; ChoiceCards and SegmentedControl have their own modules, so pages
// using one don't ship the others). Radix supplies keyboard
// behaviour, roles and form participation; brand blue marks the selection.
//
// Boundaries that identify a control (box, circle, track) use line-control,
// 3:1 on every surface. Forced-colours mode drops fills and shadows, so each
// state also has a border or outline there.
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, Minus } from "lucide-react";
import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icons";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

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
