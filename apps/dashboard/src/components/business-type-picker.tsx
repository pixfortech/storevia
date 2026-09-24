"use client";

import {
  BUSINESS_TYPE_DEFINITIONS,
  BUSINESS_TYPES,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { ChoiceCards, GlyphTile, ICON_STROKE } from "@storevia/ui";
import { Check } from "lucide-react";
import { useState } from "react";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";

/**
 * The business-type selector (ADR-0024). Presentation only: the choice shapes
 * navigation and suggestions, never the plan or anyone's permissions.
 */
export function BusinessTypePicker({
  defaultValue,
  legend = "What are you building?",
  error,
}: {
  defaultValue: BusinessType;
  legend?: string;
  error?: string | undefined;
}) {
  const [selected, setSelected] = useState<BusinessType>(defaultValue);
  const definition = BUSINESS_TYPE_DEFINITIONS[selected];
  return (
    <div>
      <ChoiceCards
        name="businessType"
        legend={legend}
        defaultValue={defaultValue}
        {...(error ? { error } : {})}
        onChange={(value) => {
          setSelected(value as BusinessType);
        }}
        options={BUSINESS_TYPES.map((type) => ({
          value: type,
          title: BUSINESS_TYPE_DEFINITIONS[type].label,
          description: BUSINESS_TYPE_DEFINITIONS[type].tagline,
          visual: <GlyphTile name={BUSINESS_TYPE_GLYPH[type]} size="md" />,
        }))}
      />
      <div className="mt-4 rounded-card bg-subtle px-4 py-3.5 text-sm" aria-live="polite">
        <p className="font-medium text-ink">
          Storevia will tailor for {definition.label.toLowerCase()}:
        </p>
        <ul className="mt-2 space-y-1.5 text-ink-muted">
          {definition.adapts.map((line) => (
            <li key={line} className="flex gap-2">
              <Check
                aria-hidden="true"
                strokeWidth={ICON_STROKE}
                className="mt-0.5 size-4 shrink-0 text-brand-600"
              />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-faint">
          You can change this at any time in store settings. It never changes your plan or what your
          team can do, and changing it keeps all your content.
        </p>
      </div>
    </div>
  );
}
