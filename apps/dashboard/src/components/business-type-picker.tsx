"use client";

import {
  BUSINESS_TYPE_DEFINITIONS,
  LAUNCH_BUSINESS_TYPES,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { ChoiceCards } from "@storevia/ui/choice-cards";
import { GlyphTile, Icon } from "@storevia/ui/icons";
import { Check } from "lucide-react";
import { useState } from "react";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";

/**
 * The business-type selector (ADR-0024). Presentation only: the choice shapes
 * navigation and suggestions, never the plan or anyone's permissions.
 *
 * It offers the launch types (DB-2: only the online store), plus a store's
 * current type when it has another. With a single type there is nothing to
 * choose, so it names the type and submits it as a hidden field.
 */
export function BusinessTypePicker({
  defaultValue,
  types = LAUNCH_BUSINESS_TYPES,
  legend = "What are you building?",
  hideLegend = false,
  error,
  onChange,
}: {
  defaultValue: BusinessType;
  /** The types offered, in order. */
  types?: readonly BusinessType[];
  legend?: string;
  /** Keeps the legend for assistive tech only (when a heading already names the choice). */
  hideLegend?: boolean;
  error?: string | undefined;
  onChange?: (type: BusinessType) => void;
}) {
  const offered = types.includes(defaultValue) ? types : [defaultValue, ...types];
  const [selected, setSelected] = useState<BusinessType>(defaultValue);
  const definition = BUSINESS_TYPE_DEFINITIONS[selected];
  const single = offered.length === 1;
  return (
    <div>
      {single ? (
        <div className="flex items-center gap-4">
          <input type="hidden" name="businessType" value={selected} />
          <GlyphTile name={BUSINESS_TYPE_GLYPH[selected]} size="lg" />
          <div className="min-w-0">
            <p className="text-body-sm font-semibold text-ink">{definition.label}</p>
            <p className="mt-0.5 text-body-sm text-ink-muted">{definition.tagline}</p>
            {error ? <p className="mt-1 text-body-sm text-danger-700">{error}</p> : null}
          </div>
        </div>
      ) : (
        <ChoiceCards
          name="businessType"
          legend={legend}
          hideLegend={hideLegend}
          defaultValue={defaultValue}
          {...(error ? { error } : {})}
          onChange={(value) => {
            setSelected(value as BusinessType);
            onChange?.(value as BusinessType);
          }}
          options={offered.map((type) => ({
            value: type,
            title: BUSINESS_TYPE_DEFINITIONS[type].label,
            description: BUSINESS_TYPE_DEFINITIONS[type].tagline,
            visual: <GlyphTile name={BUSINESS_TYPE_GLYPH[type]} size="md" />,
          }))}
        />
      )}
      <div
        className="mt-4 rounded-card border border-line bg-subtle px-4 py-4 text-body-sm sm:px-5"
        aria-live="polite"
      >
        <p className="font-medium text-ink">
          Storevia will tailor for {definition.label.toLowerCase()}:
        </p>
        <ul className="mt-2.5 space-y-1.5 text-ink-muted">
          {definition.adapts.map((line) => (
            <li key={line} className="flex gap-2.5">
              <Icon icon={Check} size="sm" className="mt-0.5 text-brand-600" />
              {line}
            </li>
          ))}
        </ul>
        {single ? null : (
          <p className="mt-3 border-t border-line pt-3 text-caption text-ink-faint">
            It never changes your plan or what your team can do, and changing it keeps all your
            content.
          </p>
        )}
      </div>
    </div>
  );
}
