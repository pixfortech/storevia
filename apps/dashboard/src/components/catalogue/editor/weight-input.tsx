"use client";

import { Field, Input, Select } from "@storevia/ui/form";
import { cn } from "@storevia/ui/cn";
import { gramsToWeight, weightToGrams, type WeightUnit } from "@storevia/validation";

// A weight typed in grams or kilograms. The server only ever sees whole
// grams (weightToGrams, exact); the unit is how the merchant thinks of it.

export interface WeightDraft {
  readonly value: string;
  readonly unit: WeightUnit;
}

export const weightDraftOf = (grams: number | null): WeightDraft => gramsToWeight(grams);

/** Whole grams, null when empty, or "invalid". */
export const weightGramsOf = (draft: WeightDraft) => weightToGrams(draft.value, draft.unit);

export const sameWeight = (a: WeightDraft, b: WeightDraft) =>
  weightGramsOf(a) === weightGramsOf(b) && (weightGramsOf(a) !== "invalid" || a.value === b.value);

export function WeightInput({
  label,
  value,
  onChange,
  error,
  description,
  hideLabel = false,
  size,
  name,
  form,
  disabled,
}: {
  label: string;
  value: WeightDraft;
  onChange: (value: WeightDraft) => void;
  error?: string | undefined;
  description?: string | undefined;
  hideLabel?: boolean;
  size?: "sm" | "md";
  /** When set, the weight is also posted as hidden "<name>" (grams) for a plain form. */
  name?: string;
  form?: string;
  disabled?: boolean;
}) {
  const grams = weightGramsOf(value);
  return (
    <Field label={label} hideLabel={hideLabel} error={error} description={description}>
      {({ id, describedBy, invalid }) => (
        <div className="flex min-w-0 gap-1.5">
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid ? true : undefined}
            inputMode="decimal"
            disabled={disabled}
            size={size}
            value={value.value}
            placeholder="0"
            onChange={(event) => {
              onChange({ ...value, value: event.currentTarget.value });
            }}
            className={cn("min-w-0 flex-1", invalid && "border-danger-500")}
          />
          <Select
            aria-label={`${label} unit`}
            disabled={disabled}
            size={size}
            value={value.unit}
            onChange={(event) => {
              onChange({ ...value, unit: event.currentTarget.value === "kg" ? "kg" : "g" });
            }}
            className="w-20 shrink-0"
          >
            <option value="g">g</option>
            <option value="kg">kg</option>
          </Select>
          {name ? (
            <input
              type="hidden"
              name={name}
              form={form}
              value={grams === "invalid" ? "invalid" : grams === null ? "" : String(grams)}
            />
          ) : null}
        </div>
      )}
    </Field>
  );
}
