"use client";
// Shared by the form controls (form.tsx, combobox.tsx, date-range-picker.tsx):
// control styling and the Field context that wires a control to its label.
// Internal: not a package entry point.
import { createContext, useContext, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

/* ----------------------------------------------------------------------------
 * Shared control styling
 * ------------------------------------------------------------------------- */

export type ControlSize = "sm" | "md" | "lg";

export const HEIGHT: Record<ControlSize, string> = { sm: "h-8", md: "h-10", lg: "h-12" };

/**
 * `size` is a height token, or (for code written against the native
 * attributes) a number, which passes through as the HTML `size` attribute.
 */
export function splitSize(size: ControlSize | number | undefined): {
  height: string;
  native: number | undefined;
} {
  return typeof size === "number"
    ? { height: HEIGHT.md, native: size }
    : { height: HEIGHT[size ?? "md"], native: undefined };
}

// 16 px text on phones stops iOS zooming into a focused field; 14 px above.
// The boundary is line-control (3:1 on every surface, WCAG 1.4.11); a
// disabled field steps back to a hairline, since it takes no input.
export const SURFACE = cn(
  "rounded-control border border-line-control bg-surface text-body text-ink shadow-xs sm:text-body-sm",
  "transition-[border-color,box-shadow,background-color] duration-(--duration-fast) ease-(--ease-standard)",
);

export const CONTROL = cn(
  "block w-full px-3 placeholder:text-ink-faint",
  SURFACE,
  "hover:border-neutral-500",
  "focus:border-brand-500 focus:outline-hidden focus:ring-3 focus:ring-brand-100",
  "disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-subtle disabled:text-ink-faint disabled:shadow-none disabled:hover:border-line-strong",
  "aria-invalid:border-danger-500 aria-invalid:hover:border-danger-500 aria-invalid:focus:ring-danger-100",
);

// An adorned control: the wrapper draws the border and focus ring, the input
// inside is bare.
export const WRAPPED = cn(
  "flex w-full items-center overflow-hidden",
  SURFACE,
  "hover:border-neutral-500",
  "focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100",
  // Forced colours drop the ring, and the frame clips the bare input's own
  // outline, so the frame draws the focus outline there.
  "forced-colors:focus-within:outline-2 forced-colors:focus-within:outline-offset-2",
  "has-disabled:cursor-not-allowed has-disabled:border-line-strong has-disabled:bg-subtle has-disabled:text-ink-faint has-disabled:shadow-none has-disabled:hover:border-line-strong",
  "has-[[aria-invalid=true]]:border-danger-500 has-[[aria-invalid=true]]:focus-within:ring-danger-100",
);

// w-0 + flex-1: the bare input takes the frame's free space instead of its
// ~20-character intrinsic width, so an adorned field never forces its column
// wider than the screen; min-w-16 keeps room to type in a shrink-to-fit parent.
export const BARE =
  "h-full w-0 min-w-16 flex-1 bg-transparent px-3 text-inherit placeholder:text-ink-faint focus:outline-hidden disabled:cursor-not-allowed";

/* ----------------------------------------------------------------------------
 * Field context: lets a control inside <Field> pick up its id and aria wiring
 * ------------------------------------------------------------------------- */

export interface FieldRenderProps {
  /** Put on the control: the label points at it. */
  id: string;
  /** Put on the control as aria-describedby (description and error ids). */
  describedBy: string | undefined;
  /** Put on the control as aria-invalid. */
  invalid: boolean;
  required: boolean;
}

export interface FieldContextValue extends FieldRenderProps {
  labelId: string;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

export interface WirableProps {
  id?: string | undefined;
  required?: boolean | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: InputHTMLAttributes<HTMLInputElement>["aria-invalid"];
}

/** Field wiring for a control; explicit props always win. */
export function useFieldWiring(props: WirableProps): WirableProps {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: props.id ?? field.id,
    required: props.required ?? (field.required || undefined),
    "aria-describedby": props["aria-describedby"] ?? field.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}
