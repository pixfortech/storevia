"use client";

import { Button, type ButtonProps } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Field, Input, Select } from "@storevia/ui/form";
import { Icon } from "@storevia/ui/icons";
import { Alert } from "@storevia/ui/surfaces";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

export interface FormState {
  readonly ok: boolean;
  readonly message?: string | undefined;
  readonly code?: string | undefined;
  readonly fieldErrors?: Readonly<Record<string, string>> | undefined;
  readonly values?: Readonly<Record<string, string>> | undefined;
}

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} {...props}>
      {children}
    </Button>
  );
}

function ReauthenticationLink({ state }: { state: FormState }) {
  if (state.code !== "REAUTHENTICATION_REQUIRED") return null;
  return (
    <>
      {" "}
      <Link href="/account/security#confirm" className="font-medium underline">
        Confirm your password
      </Link>
      , then try again.
    </>
  );
}

/**
 * The result of a form's action. `alert` (default) is a full-width message
 * above the fields; `inline` is one line with an icon, for a card footer
 * beside its submit button.
 */
export function FormMessage({
  state,
  variant = "alert",
  className,
}: {
  state: FormState;
  variant?: "alert" | "inline";
  className?: string;
}) {
  if (!state.message) return null;
  if (variant === "inline") {
    return (
      <p
        role={state.ok ? "status" : "alert"}
        className={cn(
          "flex min-w-0 items-start gap-1.5 text-body-sm font-medium",
          state.ok ? "text-success-700" : "text-danger-700",
          className,
        )}
      >
        <Icon icon={state.ok ? CircleCheck : CircleAlert} size="sm" className="mt-0.5" />
        <span className="min-w-0">
          {state.message}
          <ReauthenticationLink state={state} />
        </span>
      </p>
    );
  }
  return (
    <Alert tone={state.ok ? "success" : "danger"} {...(className ? { className } : {})}>
      {state.message}
      <ReauthenticationLink state={state} />
    </Alert>
  );
}

export function TextField({
  label,
  name,
  state,
  hint,
  defaultValue,
  ...props
}: {
  label: string;
  name: string;
  state: FormState;
  hint?: ReactNode;
  /** A segment attached to the end of the field, e.g. ".storevia.site". */
  addon?: ReactNode;
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
  value: controlled,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  name: string;
  state: FormState;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  /** Controlled value (with onChange); otherwise the field is uncontrolled. */
  value?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
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
          {...(controlled !== undefined
            ? { value: controlled, onChange }
            : value === undefined
              ? {}
              : { defaultValue: value })}
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
