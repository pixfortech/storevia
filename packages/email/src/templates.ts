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
