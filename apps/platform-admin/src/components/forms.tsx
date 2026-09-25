"use client";

import { Button, type ButtonProps } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Field, Input, Select, Textarea } from "@storevia/ui/form";
import { Alert } from "@storevia/ui/surfaces";
import type { InputHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { stepUpHref } from "@/lib/navigation";

export interface FormState {
  readonly ok: boolean;
  readonly message?: string | undefined;
  readonly code?: string | undefined;
  readonly fieldErrors?: Readonly<Record<string, string>> | undefined;
  readonly values?: Readonly<Record<string, string>> | undefined;
}

// Staff forms are used on phones too: fields and submit buttons grow to
// 44 px on touch screens.
const TOUCH_HEIGHT = "pointer-coarse:h-11";

export function SubmitButton({ children, className, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} className={cn(TOUCH_HEIGHT, className)} {...props}>
      {children}
    </Button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  const pathname = usePathname();
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {state.message}
      {state.code === "REAUTHENTICATION_REQUIRED" ? (
        <>
          {" "}
          <Link href={stepUpHref(pathname)} className="font-medium underline">
            Confirm your password
          </Link>
          , then try again.
        </>
      ) : null}
    </Alert>
  );
}

export function TextField({
  label,
  name,
  state,
  hint,
  defaultValue,
  className,
  ...props
}: {
  label: string;
  name: string;
  state: FormState;
  hint?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name">) {
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? defaultValue;
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          name={name}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(TOUCH_HEIGHT, className)}
          {...(value === undefined || props.value !== undefined ? {} : { defaultValue: value })}
          {...props}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  name,
  state,
  options,
  defaultValue,
  hint,
  disabled,
}: {
  label: string;
  name: string;
  state: FormState;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? defaultValue;
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <Select
          id={id}
          name={name}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={TOUCH_HEIGHT}
          {...(value === undefined ? {} : { defaultValue: value })}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  name,
  state,
  hint,
  rows = 3,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  state: FormState;
  hint?: ReactNode;
  rows?: number;
  required?: boolean;
  placeholder?: string;
}) {
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name];
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <Textarea
          id={id}
          name={name}
          rows={rows}
          required={required}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          defaultValue={value}
        />
      )}
    </Field>
  );
}

export function CheckboxField({
  label,
  name,
  state,
}: {
  label: ReactNode;
  name: string;
  state: FormState;
}) {
  const error = state.fieldErrors?.[name];
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name={name}
          className="mt-0.5 size-4 rounded border-line accent-brand-600"
          aria-invalid={error ? true : undefined}
          defaultChecked={state.values?.[name] === "on"}
        />
        <span>{label}</span>
      </label>
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}
    </div>
  );
}
