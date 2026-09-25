// Client-side checks for the auth forms: they catch empty and obviously
// malformed fields before a round trip, so each field can show its own
// message. The server actions stay the authority and validate everything
// again; these rules must never be stricter than the server's, or a valid
// submission could be blocked.

export type FieldRule =
  | { readonly kind: "required"; readonly message: string }
  | { readonly kind: "email" }
  | { readonly kind: "minLength"; readonly min: number }
  | { readonly kind: "matches"; readonly field: string; readonly message: string };

export type FieldRules = Readonly<Record<string, readonly FieldRule[]>>;
export type FieldErrors = Readonly<Record<string, string>>;

// Deliberately loose (something@something.something): the server's email
// schema is the real check.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function check(rule: FieldRule, value: string, values: Readonly<Record<string, string>>) {
  switch (rule.kind) {
    case "required":
      return value.trim() === "" ? rule.message : undefined;
    case "email":
      return EMAIL_SHAPE.test(value.trim()) ? undefined : "Enter a valid email address.";
    case "minLength":
      return value.length < rule.min ? `Use at least ${String(rule.min)} characters.` : undefined;
    case "matches":
      return value === (values[rule.field] ?? "") ? undefined : rule.message;
  }
}

/** The first failing rule's message for each field, in the order the rules list them. */
export function validateFields(
  values: Readonly<Record<string, string>>,
  rules: FieldRules,
): FieldErrors {
  const errors: Record<string, string> = {};
  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = values[field] ?? "";
    for (const rule of fieldRules) {
      const message = check(rule, value, values);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }
  return errors;
}

const EMAIL: readonly FieldRule[] = [
  { kind: "required", message: "Enter your email address." },
  { kind: "email" },
];

export const SIGN_IN_RULES: FieldRules = {
  email: EMAIL,
  password: [{ kind: "required", message: "Enter your password." }],
};

export const EMAIL_RULES: FieldRules = { email: EMAIL };

export function signUpRules(passwordMinLength: number): FieldRules {
  return {
    name: [{ kind: "required", message: "Enter your name." }],
    email: EMAIL,
    password: [
      { kind: "required", message: "Choose a password." },
      { kind: "minLength", min: passwordMinLength },
    ],
  };
}

export function newPasswordRules(passwordMinLength: number): FieldRules {
  return {
    password: [
      { kind: "required", message: "Choose a new password." },
      { kind: "minLength", min: passwordMinLength },
    ],
    confirmPassword: [
      { kind: "required", message: "Enter the new password again." },
      { kind: "matches", field: "password", message: "Passwords don't match." },
    ],
  };
}

/** The string entries of a submitted form (files are ignored). */
export function formEntries(data: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of data.entries()) if (typeof value === "string") values[key] = value;
  return values;
}
