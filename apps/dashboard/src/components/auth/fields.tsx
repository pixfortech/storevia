"use client";

import { Button } from "@storevia/ui/button";
import { Field, Input } from "@storevia/ui/form";
import { VisuallyHidden } from "@storevia/ui/surfaces";
import { Eye, EyeOff } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type InputEvent,
  type SubmitEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { formEntries, validateFields, type FieldErrors, type FieldRules } from "./validation";

// Auth fields are 44 px tall at every size: comfortable to tap, and one
// rhythm with the submit button.
const FIELD_HEIGHT = "h-11";

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "type" | "size" | "defaultValue" | "children"
>;

interface AuthFieldProps extends NativeInputProps {
  label: string;
  name: string;
  type?: "text" | "email";
  error?: string | undefined;
  hint?: ReactNode;
  /** Echoed value after a failed submit. */
  defaultValue?: string | undefined;
  ref?: Ref<HTMLInputElement>;
}

/** A labelled text field; the error comes from client checks or the server. */
export function AuthField({ label, name, error, hint, defaultValue, ...props }: AuthFieldProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          name={name}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          defaultValue={defaultValue}
          className={FIELD_HEIGHT}
          {...props}
        />
      )}
    </Field>
  );
}

interface PasswordFieldProps extends NativeInputProps {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: ReactNode;
}

/**
 * A password field with a show/hide toggle. The toggle's name is its
 * (visually hidden) text rather than an aria-label: an aria-label containing
 * "password" would also answer to the field's label and make "Password"
 * ambiguous for assistive tech queries and the E2E suite.
 */
export function PasswordField({ label, name, error, hint, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Mask again on submit, so the browser sees a password field (and offers to
  // save it) and the value isn't left on screen.
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
    <Field label={label} hint={hint} error={error}>
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
          className={FIELD_HEIGHT}
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

/**
 * Client checks before a form action runs: on submit, invalid fields get
 * their message, the first one takes focus and the action doesn't run.
 * Typing in a field clears its message.
 */
export function useFieldChecks(rules: FieldRules) {
  const [errors, setErrors] = useState<FieldErrors>({});

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const next = validateFields(formEntries(new FormData(form)), rules);
    setErrors(next);
    const first = Array.from(form.elements).find(
      (el): el is HTMLInputElement => el instanceof HTMLInputElement && el.name in next,
    );
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }

  function onInput(event: InputEvent<HTMLFormElement>) {
    const { name } = event.target as HTMLInputElement;
    if (!(name in errors)) return;
    setErrors(({ [name]: _cleared, ...rest }) => rest);
  }

  return { errors, hasErrors: Object.keys(errors).length > 0, formProps: { onSubmit, onInput } };
}
