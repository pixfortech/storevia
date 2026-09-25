"use client";
// ChoiceCards (docs/design/design-plan.md §4–5): large selectable cards for a
// single choice, such as a store's business type.
import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icons";

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
