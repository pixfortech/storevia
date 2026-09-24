import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "./cn";

const CONTROL =
  "block w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink " +
  "placeholder:text-ink-faint shadow-xs transition-colors hover:border-ink-faint " +
  "focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 " +
  "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-muted " +
  "aria-[invalid=true]:border-danger-600 aria-[invalid=true]:ring-danger-600/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, "h-10", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(CONTROL, "h-10 pr-8", className)} {...props}>
        {children}
      </select>
    );
  },
);

export interface FieldProps {
  label: string;
  /** Renders the control; receives the ids to wire up label, hint and error. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  className?: string;
}

/** Label + control + hint + error, with correct aria wiring. */
export function Field({ label, children, hint, error, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
