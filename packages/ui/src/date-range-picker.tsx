"use client";
// DateRangePicker (docs/design/design-plan.md §5): preset ranges plus custom
// dates. Its own module so plain form fields don't ship it.
import { useId, useState } from "react";
import { dateRangeBounds, type DateRangePreset, type DateRangeValue } from "./control-helpers";
import { SegmentedControl } from "./segmented-control";
import { cn } from "./cn";
import { Input } from "./form";
import { FieldContext } from "./form-core";

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
