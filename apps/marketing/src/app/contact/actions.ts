"use server";

import { contactRequestMessage, getEmailSender } from "@storevia/email";
import { marketingDb } from "@storevia/database/marketing";
import { createLogger, errorFields, recordMetric } from "@storevia/observability";
import { clientIp } from "@storevia/security";
import { consumeRateLimitsWith } from "@storevia/security/rate-limit";
import { headers } from "next/headers";
import { z } from "zod";
import { env } from "@/lib/env";
import { CONTACT_TOPICS, isContactTopic } from "./topics";

const log = createLogger({ app: "marketing", component: "contact" });

export interface ContactState {
  readonly status: "idle" | "sent" | "invalid" | "limited" | "failed";
  readonly fieldErrors?: Readonly<Record<string, string>> | undefined;
  readonly values?: Readonly<Record<string, string>> | undefined;
}

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120, "Use 120 characters or fewer"),
  email: z.email("Enter a valid email address").trim().max(254),
  company: z.string().trim().max(160, "Use 160 characters or fewer"),
  topic: z.string().refine(isContactTopic, "Choose a topic"),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters)")
    .max(5000, "Use 5,000 characters or fewer"),
});

// Limits are counted in the marketing role's own "marketing:" buckets (ADR-0025).
const RULES = {
  ip: { name: "marketing:contact:ip", limit: 5, windowSeconds: 3600 },
  email: { name: "marketing:contact:email", limit: 3, windowSeconds: 3600 },
  all: { name: "marketing:contact:all", limit: 200, windowSeconds: 3600 },
} as const;

export async function sendContactRequest(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const raw = {
    name: field("name"),
    email: field("email"),
    company: field("company"),
    topic: field("topic"),
    message: field("message"),
  };
  // Honeypot: people never see or fill this field. Pretend success to bots.
  if (field("website") !== "") {
    recordMetric("marketing.contact", 1, { outcome: "honeypot" });
    return { status: "sent" };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { status: "invalid", fieldErrors, values: raw };
  }
  const request = parsed.data;
  const h = await headers();
  try {
    const limit = await consumeRateLimitsWith(marketingDb(), [
      [RULES.ip, clientIp(h)],
      [RULES.email, request.email.toLowerCase()],
      [RULES.all, "site"],
    ]);
    if (!limit.allowed) {
      recordMetric("marketing.contact", 1, { outcome: "rate_limited" });
      return { status: "limited", values: raw };
    }
    const topic = CONTACT_TOPICS.find((t) => t.value === request.topic)?.label ?? request.topic;
    await getEmailSender().send(contactRequestMessage(env().CONTACT_INBOX, { ...request, topic }));
    // Never log the visitor's details or message.
    log.info("contact request delivered", {
      requestId: h.get("x-request-id") ?? undefined,
      topic: request.topic,
    });
    recordMetric("marketing.contact", 1, { outcome: "sent" });
    return { status: "sent" };
  } catch (error) {
    log.error("contact request failed", {
      requestId: h.get("x-request-id") ?? undefined,
      ...errorFields(error),
    });
    recordMetric("marketing.contact", 1, { outcome: "failed" });
    return { status: "failed", values: raw };
  }
}
