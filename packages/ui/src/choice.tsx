"use client";

// Accessible choice cards: a radio group styled as cards (e.g. the
// business-type selector). Native radios keep keyboard and form behaviour.
import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export interface ChoiceOption {
  readonly value: string;
  readonly title: string;
  readonly description?: string;
  readonly visual?: ReactNode;
}

export function ChoiceCards({
  name,
  legend,
  options,
  defaultValue,
  columns = 2,
  error,
  onChange,
}: {
  name: string;
  legend: string;
  options: readonly ChoiceOption[];
  defaultValue?: string;
  columns?: 1 | 2 | 4;
  error?: string;
  onChange?: (value: string) => void;
}) {
  const errorId = useId();
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      <div
        className={cn(
          "mt-3 grid gap-3",
          columns === 2 && "sm:grid-cols-2",
          columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "group relative flex cursor-pointer gap-3.5 rounded-card border border-line bg-surface p-4 shadow-xs",
              "transition-[border-color,box-shadow,background-color] duration-(--duration-fast) ease-(--ease-standard)",
              "hover:border-line-strong has-[:checked]:border-brand-600 has-[:checked]:bg-brand-25 has-[:checked]:shadow-[0_0_0_1px_var(--color-brand-600)]",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
              onChange={() => onChange?.(option.value)}
              className="peer sr-only"
            />
            {option.visual}
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink">{option.title}</span>
              {option.description ? (
                <span className="mt-1 block text-sm text-ink-muted">{option.description}</span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className="absolute right-3.5 top-3.5 size-4 rounded-full border border-line-strong bg-surface peer-checked:border-[5px] peer-checked:border-brand-600"
            />
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="mt-2 text-sm text-danger-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
