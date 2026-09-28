"use client";

import { Checkbox } from "@storevia/ui/choice";
import { SearchInput } from "@storevia/ui/form";
import { Icon } from "@storevia/ui/icons";
import { CircleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

// A searchable multiple choice: a fieldset of checkboxes by name, filtered
// as you type (case- and accent-insensitive, by name or code). The choice
// lives in React state, so options filtered out of view stay chosen; the
// form submits one hidden field per chosen value (`name` repeated).

export interface ChecklistOption {
  readonly value: string;
  readonly label: string;
  /** Shown under the label, e.g. why the option can't be chosen. */
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function Checklist({
  legend,
  name,
  hint,
  status,
  searchLabel,
  options,
  selected,
  onChange,
  error,
}: {
  legend: string;
  /** Submitted once per chosen value. */
  name: string;
  hint?: ReactNode;
  /** A live summary of the choice, e.g. "2 selected" or "Whole country". */
  status: ReactNode;
  searchLabel: string;
  options: readonly ChecklistOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  error?: string | undefined;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const needle = fold(query);
  const shown = needle
    ? options.filter((o) => fold(o.label).includes(needle) || fold(o.value) === needle)
    : options;
  const chosen = new Set(selected);
  const toggle = (value: string, on: boolean) => {
    // Keeps the options' own order, whatever order they were ticked in.
    onChange(options.map((o) => o.value).filter((v) => (v === value ? on : chosen.has(v))));
  };
  const describedBy = [hint ? `${id}-hint` : null, `${id}-status`, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <fieldset className="grid min-w-0 gap-2" aria-describedby={describedBy}>
      <legend className="mb-2 text-label text-ink">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-1 text-label font-normal text-ink-muted">
          {hint}
        </p>
      ) : null}
      <SearchInput
        aria-label={searchLabel}
        placeholder={searchLabel}
        size="sm"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <div className="max-h-56 overflow-y-auto overscroll-contain rounded-control border border-line bg-surface p-3">
        {shown.length === 0 ? (
          <p className="text-body-sm text-ink-muted">No matches.</p>
        ) : (
          <ul className="grid gap-3">
            {shown.map((o) => (
              <li key={o.value}>
                <Checkbox
                  label={o.label}
                  description={o.description}
                  disabled={o.disabled ?? false}
                  checked={chosen.has(o.value)}
                  onCheckedChange={(checked) => {
                    toggle(o.value, checked === true);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={`${id}-status`} className="text-label font-normal text-ink-muted" aria-live="polite">
        {status}
      </p>
      {error ? (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-label font-normal text-danger-700"
        >
          <Icon icon={CircleAlert} size="xs" className="mt-0.5" />
          <span className="min-w-0">{error}</span>
        </p>
      ) : null}
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
    </fieldset>
  );
}
