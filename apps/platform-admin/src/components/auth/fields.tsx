"use client";

import { Button, Field, Input, VisuallyHidden } from "@storevia/ui";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

// The staff sign-in's fields: 44 px tall, errors through Field (aria-invalid
// and a described-by message). The merchant dashboard has the same pair in
// its own components/auth.

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "type" | "size" | "defaultValue" | "children"
>;

interface StaffFieldProps extends NativeInputProps {
  label: string;
  name: string;
  error?: string | undefined;
  defaultValue?: string | undefined;
}

export function EmailField({ label, name, error, defaultValue, ...props }: StaffFieldProps) {
  return (
    <Field label={label} error={error}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          name={name}
          type="email"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          defaultValue={defaultValue}
          className="h-11"
          {...props}
        />
      )}
    </Field>
  );
}

/**
 * A password field with a show/hide toggle. The toggle is named by hidden
 * text, not an aria-label containing "password", which would also answer to
 * the field's own label.
 */
export function PasswordField({
  label,
  name,
  error,
  ...props
}: Omit<StaffFieldProps, "defaultValue">) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Mask again on submit, so the browser sees a password field.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const hide = () => {
      setVisible(false);
    };
    form.addEventListener("submit", hide);
    return () => {
      form.removeEventListener("submit", hide);
    };
  }, []);

  return (
    <Field label={label} error={error}>
      {({ id, describedBy, invalid }) => (
        <Input
          ref={input}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          spellCheck={false}
          autoCapitalize="none"
          className="h-11"
          trailing={
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={visible ? EyeOff : Eye}
              aria-pressed={visible}
              aria-controls={id}
              onClick={() => {
                setVisible((v) => !v);
              }}
              // On touch, fill the field's inner height (the frame clips
              // anything taller): a 44 x 42 target in a 44 px field.
              className="-mr-1 w-8 px-0 text-ink-faint hover:text-ink pointer-coarse:h-[2.625rem] pointer-coarse:w-11"
            >
              <VisuallyHidden>Show password</VisuallyHidden>
            </Button>
          }
          {...props}
        />
      )}
    </Field>
  );
}
