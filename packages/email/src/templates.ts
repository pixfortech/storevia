import type { EmailMessage } from "./sender";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function layout(
  title: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p><p style="margin:0 0 16px;color:#6b7280;font-size:13px">Or paste this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}${button}<p style="color:#6b7280;font-size:13px">Storevia</p></body></html>`;
}

export function verifyEmailMessage(to: string, name: string, url: string): EmailMessage {
  const lines = [
    `Hi ${name},`,
    "Confirm your email address to finish setting up your Storevia account. The link expires in 24 hours.",
  ];
  return {
    to,
    template: "verify-email",
    subject: "Confirm your email for Storevia",
    text: `${lines.join("\n\n")}\n\n${url}\n\nIf you didn't create an account, you can ignore this email.`,
    html: layout(
      "Confirm your email",
      [...lines, "If you didn't create an account, you can ignore this email."],
      { label: "Confirm email", url },
    ),
  };
}

export function resetPasswordMessage(to: string, name: string, url: string): EmailMessage {
  const lines = [
    `Hi ${name},`,
    "Someone asked to reset the password for your Storevia account. The link expires in 30 minutes and works once.",
  ];
  return {
    to,
    template: "reset-password",
    subject: "Reset your Storevia password",
    text: `${lines.join("\n\n")}\n\n${url}\n\nIf this wasn't you, ignore this email. Your password won't change.`,
    html: layout(
      "Reset your password",
      [...lines, "If this wasn't you, ignore this email. Your password won't change."],
      { label: "Reset password", url },
    ),
  };
}

export function existingAccountMessage(to: string, name: string, signInUrl: string): EmailMessage {
  const lines = [
    `Hi ${name},`,
    "Someone tried to create a Storevia account with this email address, but you already have one.",
  ];
  return {
    to,
    template: "existing-account",
    subject: "You already have a Storevia account",
    text: `${lines.join("\n\n")}\n\nSign in: ${signInUrl}\n\nIf you forgot your password, use "Forgot password" on the sign-in page.`,
    html: layout(
      "You already have an account",
      [...lines, 'If you forgot your password, use "Forgot password" on the sign-in page.'],
      { label: "Sign in", url: signInUrl },
    ),
  };
}

/** Billing notices (M8). The plan name is shown, never used to decide anything. */
export type BillingNoticeKind = "trial_ending" | "payment_overdue" | "plan_ended";

export interface BillingNoticeInput {
  readonly kind: BillingNoticeKind;
  readonly organisationName: string;
  readonly planName: string;
  /** Trial end, grace end or the date the plan ended. */
  readonly date: Date;
  /** The organisation's billing page, when the dashboard URL is known. */
  readonly billingUrl: string | null;
}

const longDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(date);

export function billingNoticeMessage(to: string, notice: BillingNoticeInput): EmailMessage {
  const org = notice.organisationName;
  const when = longDate(notice.date);
  const copy: Record<BillingNoticeKind, { subject: string; title: string; lines: string[] }> = {
    trial_ending: {
      subject: `Your Storevia trial for ${org} ends on ${when}`,
      title: "Your trial is ending",
      lines: [
        `The ${notice.planName} trial for ${org} ends on ${when}.`,
        "To keep its features, contact Storevia support before then. If the trial ends, your stores and data stay; anything beyond the free allowance can't be added to until a plan is in place.",
      ],
    },
    payment_overdue: {
      subject: `Payment for ${org} is overdue`,
      title: "Payment is overdue",
      lines: [
        `Payment for the ${notice.planName} plan of ${org} is overdue.`,
        `Your plan stays active until ${when}. Contact Storevia support to settle it before then.`,
      ],
    },
    plan_ended: {
      subject: `The ${notice.planName} plan for ${org} has ended`,
      title: "Your plan has ended",
      lines: [
        `The ${notice.planName} plan for ${org} ended on ${when}.`,
        "Nothing has been deleted: your stores keep working within the free allowance, and anything above it can't be added to. Contact Storevia support to choose a plan.",
      ],
    },
  };
  const { subject, title, lines } = copy[notice.kind];
  const action = notice.billingUrl ? { label: "View billing", url: notice.billingUrl } : undefined;
  return {
    to,
    template: `billing-${notice.kind.replaceAll("_", "-")}`,
    subject,
    text: [...lines, ...(action ? [`View billing: ${action.url}`] : [])].join("\n\n"),
    html: layout(title, lines, action),
  };
}

export function accountDeletedMessage(to: string, name: string): EmailMessage {
  const lines = [
    `Hi ${name},`,
    "Your Storevia account has been deleted. You've been signed out everywhere and removed from every team you were in.",
    "Orders and records that belong to the businesses you worked with stay with them.",
    "If this wasn't you, contact support straight away.",
  ];
  return {
    to,
    template: "account-deleted",
    subject: "Your Storevia account was deleted",
    text: lines.join("\n\n"),
    html: layout("Account deleted", lines),
  };
}

export function passwordChangedMessage(to: string, name: string): EmailMessage {
  const lines = [
    `Hi ${name},`,
    "The password for your Storevia account was just changed, and your other sessions were signed out.",
    "If this wasn't you, reset your password immediately and contact support.",
  ];
  return {
    to,
    template: "password-changed",
    subject: "Your Storevia password was changed",
    text: lines.join("\n\n"),
    html: layout("Password changed", lines),
  };
}

/** To the NEW address: the link that completes an email change (DB-4). */
export function confirmEmailChangeMessage(
  to: string,
  name: string,
  currentEmail: string,
  url: string,
): EmailMessage {
  const lines = [
    `Hi ${name},`,
    `You asked to change the email address of your Storevia account from ${currentEmail} to this one. Confirm it to finish. The link expires in 1 hour and works once.`,
    `Until you confirm, you keep signing in with ${currentEmail}.`,
  ];
  const ignore = "If you didn't ask for this, ignore this email. Nothing changes.";
  return {
    to,
    template: "confirm-email-change",
    subject: "Confirm your new email for Storevia",
    text: `${lines.join("\n\n")}\n\n${url}\n\n${ignore}`,
    html: layout("Confirm your new email", [...lines, ignore], { label: "Confirm new email", url }),
  };
}

/**
 * To an address that already has an account, when someone asks to move
 * another account onto it (DB-4). Mirrors the sign-up "account exists"
 * notice: the requester is told the same thing either way.
 */
export function emailChangeAddressInUseMessage(
  to: string,
  name: string,
  signInUrl: string,
): EmailMessage {
  const lines = [
    `Hi ${name},`,
    "Someone asked to change another Storevia account's email address to this one. This address already belongs to your account, so nothing was changed.",
    "You don't need to do anything.",
  ];
  return {
    to,
    template: "email-change-address-in-use",
    subject: "This email already has a Storevia account",
    text: `${lines.join("\n\n")}\n\nSign in: ${signInUrl}`,
    html: layout("This email is already in use", lines, { label: "Sign in", url: signInUrl }),
  };
}

/**
 * To the OLD address, once an email change is confirmed (DB-4). `newEmail`
 * is masked by the caller; `helpUrl` links support when one is configured.
 */
export function emailChangedMessage(
  to: string,
  name: string,
  newEmail: string,
  helpUrl?: string,
): EmailMessage {
  const lines = [
    `Hi ${name},`,
    `The email address of your Storevia account was changed to ${newEmail}. You now sign in with the new address, and your other sessions were signed out.`,
    "If this wasn't you, contact Storevia support straight away so we can secure your account. Mention that this notice was sent to this address.",
  ];
  return {
    to,
    template: "email-changed",
    subject: "Your Storevia email address was changed",
    text: `${lines.join("\n\n")}${helpUrl ? `\n\nGet help: ${helpUrl}` : ""}`,
    html: layout(
      "Email address changed",
      lines,
      helpUrl ? { label: "Get help", url: helpUrl } : undefined,
    ),
  };
}

export function invitationMessage(
  to: string,
  inviterName: string,
  organisationName: string,
  role: string,
  url: string,
): EmailMessage {
  const lines = [
    `${inviterName} invited you to join ${organisationName} on Storevia as ${role}.`,
    "The invitation expires in 7 days. Sign in (or create an account) with this email address to accept it.",
  ];
  return {
    to,
    template: "invitation",
    subject: `Join ${organisationName} on Storevia`,
    text: `${lines.join("\n\n")}\n\n${url}`,
    html: layout(`Join ${organisationName}`, lines, { label: "View invitation", url }),
  };
}

export interface ContactRequest {
  readonly name: string;
  readonly email: string;
  readonly company: string;
  readonly topic: string;
  readonly message: string;
}

/**
 * A message from the public contact form, delivered to Storevia's inbox. All
 * fields are visitor input: escaped in HTML, and line breaks are removed from
 * everything that reaches a header.
 */
export function contactRequestMessage(to: string, request: ContactRequest): EmailMessage {
  const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  const details = [
    `From: ${oneLine(request.name)} <${oneLine(request.email)}>`,
    `Company: ${oneLine(request.company) || "Not given"}`,
    `Topic: ${oneLine(request.topic)}`,
  ];
  return {
    to,
    template: "contact-request",
    subject: `Contact form: ${oneLine(request.topic)} from ${oneLine(request.name)}`.slice(0, 160),
    text: `${details.join("\n")}\n\n${request.message}\n\nReply directly to ${oneLine(request.email)}. Sent from the storevia.com contact form.`,
    html: layout("New contact request", [
      ...details,
      ...request.message.split(/\n{2,}/),
      `Reply directly to ${oneLine(request.email)}. Sent from the storevia.com contact form.`,
    ]),
  };
}
