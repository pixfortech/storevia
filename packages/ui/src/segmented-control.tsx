"use client";
// SegmentedControl (docs/design/design-plan.md §4–5): one choice from a few
// short options, on Radix RadioGroup (roles, arrow keys, form participation).
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icons";

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
