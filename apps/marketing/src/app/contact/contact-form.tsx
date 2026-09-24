"use client";

import { Alert, Button, Field, Input, Select, Textarea } from "@storevia/ui";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendContactRequest, type ContactState } from "./actions";
import { CONTACT_TOPICS } from "./topics";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" pending={pending} className="w-full sm:w-auto">
      Send message
    </Button>
  );
}

const MESSAGES: Partial<
  Record<ContactState["status"], { tone: "danger" | "warning"; text: string }>
> = {
  limited: {
    tone: "warning",
    text: "You've sent several messages recently. Please wait an hour and try again.",
  },
  failed: {
    tone: "danger",
    text: "Your message couldn't be sent just now. Please try again in a few minutes.",
  },
  invalid: { tone: "danger", text: "Please check the highlighted fields." },
};

export function ContactForm({ topic, message }: { topic: string; message: string }) {
  const [state, action] = useActionState(sendContactRequest, { status: "idle" });
  if (state.status === "sent") {
    return (
      <Alert tone="success" title="Thanks, your message is on its way">
        We read every message and reply by email, usually within two working days.
      </Alert>
    );
  }
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const notice = MESSAGES[state.status];
  // Remount with the echoed values after each attempt (React resets forms).
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-5" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" error={state.fieldErrors?.["name"]}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="name"
              autoComplete="name"
              required
              defaultValue={value("name")}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label="Work email" error={state.fieldErrors?.["email"]}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={value("email")}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label="Company" hint="Optional" error={state.fieldErrors?.["company"]}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="company"
              autoComplete="organization"
              defaultValue={value("company")}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label="Topic" error={state.fieldErrors?.["topic"]}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="topic"
              defaultValue={value("topic", topic)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            >
              {CONTACT_TOPICS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Message" error={state.fieldErrors?.["message"]}>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="message"
            rows={6}
            required
            defaultValue={value("message", message)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      {/* Honeypot for bots: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-faint">We use your details only to reply to this message.</p>
        <Submit />
      </div>
    </form>
  );
}
