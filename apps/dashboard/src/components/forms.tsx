"use client";

import { Alert, Button, Field, Input, Select, type ButtonProps } from "@storevia/ui";
import type { InputHTMLAttributes, ReactNode } from "react";
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

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {state.message}
      {state.code === "REAUTHENTICATION_REQUIRED" ? (
        <>
          {" "}
          <Link href="/account/security#confirm" className="font-medium underline">
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
