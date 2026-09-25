"use client";

import { Button } from "@storevia/ui/button";
import { Field, Input, Select, Textarea } from "@storevia/ui/form";
import { Illustration } from "@storevia/ui/illustrations";
import { Alert } from "@storevia/ui/surfaces";
import { useActionState, useEffect, useRef } from "react";
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

/** The confirmation that replaces the form; focus moves to it so it's announced. */
function Sent() {
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div role="status" className="flex flex-col items-center py-6 text-center sm:py-10">
      <Illustration name="setup-complete" size="sm" />
      <p
        ref={heading}
        tabIndex={-1}
        className="mt-6 rounded-xs font-display text-h4 text-ink focus-visible:outline-offset-4"
      >
        Thanks, your message is on its way
      </p>
      <p className="mt-2 max-w-sm text-body-sm text-ink-muted">
        A person on the team reads every message and replies by email.
      </p>
    </div>
  );
}

export function ContactForm({ topic, message }: { topic: string; message: string }) {
  const [state, action] = useActionState(sendContactRequest, { status: "idle" });
  if (state.status === "sent") return <Sent />;
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const error = (name: string) => state.fieldErrors?.[name];
  const notice = MESSAGES[state.status];
  // Remount with the echoed values after each attempt (React resets forms).
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-6" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Your name" required error={error("name")}>
          <Input name="name" autoComplete="name" defaultValue={value("name")} />
        </Field>
        <Field label="Work email" required error={error("email")}>
          <Input name="email" type="email" autoComplete="email" defaultValue={value("email")} />
        </Field>
        <Field label="Company" optional error={error("company")}>
          <Input name="company" autoComplete="organization" defaultValue={value("company")} />
        </Field>
        <Field label="Topic" error={error("topic")}>
          <Select name="topic" defaultValue={value("topic", topic)}>
            {CONTACT_TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Message" required error={error("message")}>
        <Textarea name="message" rows={6} defaultValue={value("message", message)} />
      </Field>
      {/* Honeypot for bots: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-ink-faint">
          We use your details only to reply to this message.
        </p>
        <Submit />
      </div>
    </form>
  );
}
