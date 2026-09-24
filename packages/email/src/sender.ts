import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Machine-readable template name, used by tests and logs (never the content). */
  readonly template: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** SMTP (Mailpit locally, a provider relay in production). */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;
  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: { "X-Storevia-Template": message.template },
    });
  }
}

/**
 * Writes each email as JSON into a directory. Used by E2E tests and by local
 * development without an SMTP server. Refused in production.
 */
export class FileEmailSender implements EmailSender {
  constructor(private readonly directory: string) {}
  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const safeRecipient = message.to.replace(/[^a-z0-9@._-]/gi, "_");
    const file = join(
      this.directory,
      `${String(Date.now())}-${safeRecipient}-${message.template}.json`,
    );
    await writeFile(
      file,
      JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2),
    );
  }
}

let cached: EmailSender | undefined;

/** Chooses the transport from EMAIL_TRANSPORT (smtp | file). */
export function getEmailSender(): EmailSender {
  if (cached) return cached;
  const transport = process.env["EMAIL_TRANSPORT"] ?? "smtp";
  if (transport === "file") {
    if (process.env["STOREVIA_ENV"] === "production") {
      throw new Error("EMAIL_TRANSPORT=file is not allowed in production");
    }
    cached = new FileEmailSender(process.env["EMAIL_FILE_DIR"] ?? ".storevia/mail");
  } else {
    const url = process.env["SMTP_URL"];
    if (!url) throw new Error("SMTP_URL is not set");
    cached = new SmtpEmailSender(
      url,
      process.env["EMAIL_FROM"] ?? "Storevia <no-reply@storevia.com>",
    );
  }
  return cached;
}
