"use client";

import { useActionState, useState, type InputEvent, type SubmitEvent } from "react";
import { EmailField, PasswordField } from "@/components/auth/fields";
import { AuthFormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/forms";
import { signInAction } from "../actions";

type Errors = Partial<Record<"email" | "password", string>>;

// Catches empty fields before a round trip; the server action stays the
// authority (loose on purpose, so it can never block a valid sign-in).
function check(data: FormData): Errors {
  const rawEmail = data.get("email");
  const password = data.get("password");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const errors: Errors = {};
  if (!email) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (typeof password !== "string" || password === "") errors.password = "Enter your password.";
  return errors;
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, { ok: false });
  const [errors, setErrors] = useState<Errors>({});

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const found = check(new FormData(form));
    setErrors(found);
    const first = (["email", "password"] as const).find((name) => found[name]);
    if (first) {
      event.preventDefault();
      const field = form.elements.namedItem(first);
      if (field instanceof HTMLInputElement) field.focus();
    }
  }

  function onInput(event: InputEvent<HTMLFormElement>) {
    const { name } = event.target as HTMLInputElement;
    if (name === "email" || name === "password") {
      setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
    }
  }

  const hasErrors = Boolean(errors.email ?? errors.password);
  return (
    <form action={action} onSubmit={onSubmit} onInput={onInput} className="grid gap-5" noValidate>
      <AuthFormMessage state={state} hidden={hasErrors} />
      <input type="hidden" name="next" value={next} />
      <EmailField
        label="Email"
        name="email"
        autoComplete="email"
        required
        error={errors.email}
        defaultValue={state.values?.["email"]}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        error={errors.password}
      />
      <SubmitButton className="mt-1 h-11 w-full">Sign in</SubmitButton>
    </form>
  );
}
