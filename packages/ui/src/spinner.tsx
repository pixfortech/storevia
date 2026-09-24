// Spinner (docs/design/design-plan.md §7). Server-safe and dependency-free, so
// Button can use it without pulling the Radix-based feedback controls into
// every page that renders a button.
import type { SVGProps } from "react";
import { cn } from "./cn";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

const SPINNER_CLASS: Record<SpinnerSize, string> = {
  xs: "size-3",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export interface SpinnerProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** xs 12, sm 16 (default), md 20, lg 24 px. */
  size?: SpinnerSize;
  /** Announced to assistive tech. Without it the spinner is decorative. */
  label?: string;
}

const SPINNER_ARC = "M12 3a9 9 0 0 1 9 9";

/**
 * An indeterminate activity indicator in currentColor. Under reduced motion
 * the arc doesn't turn: the whole ring pulses gently instead (SMIL, which the
 * CSS reduced-motion override can't freeze).
 */
export function Spinner({ size = "sm", label, className, ...props }: SpinnerProps) {
  const svg = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      className={cn(SPINNER_CLASS[size], "shrink-0", className)}
      {...props}
    >
      <g className="motion-reduce:hidden">
        <circle cx={12} cy={12} r={9} opacity={0.18} />
        <path d={SPINNER_ARC}>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.75s"
            repeatCount="indefinite"
          />
        </path>
      </g>
      <circle cx={12} cy={12} r={9} opacity={0.7} className="hidden motion-reduce:inline">
        <animate
          attributeName="opacity"
          values="0.7;0.25;0.7"
          dur="2s"
          calcMode="spline"
          keyTimes="0;0.5;1"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
  if (!label) return svg;
  return (
    <span role="status" className="inline-flex">
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  );
}
