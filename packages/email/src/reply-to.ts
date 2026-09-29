// Where a shopper's reply to a store's email goes (final pass, CO-3): the
// store's support email, else its contact email, else Storevia's own
// address. Every candidate is checked here as well as when it was saved:
// an address that could carry another header (CR, LF, a comma, angle
// brackets, any control character) is never used.

/** A single plain address: local@domain, printable, no separators, at most 254 characters. */
const PLAIN_ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** The address itself when it is one safe, plain email address; otherwise null. */
export function safeEmailAddress(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();
  if (address.length === 0 || address.length > 254) return null;
  return PLAIN_ADDRESS.test(address) ? address : null;
}

/** The address inside `Name <address>`, or the value itself when it is a plain address. */
function addressOf(value: string | undefined): string | null {
  if (!value) return null;
  const bracketed = /<([^<>]+)>\s*$/.exec(value);
  return safeEmailAddress(bracketed ? bracketed[1] : value);
}

const DEFAULT_PLATFORM_ADDRESS = "no-reply@storevia.com";

/**
 * Storevia's fallback: EMAIL_REPLY_TO_FALLBACK when set (a monitored
 * support mailbox), else the address mail is sent from (EMAIL_FROM).
 */
export function platformReplyTo(env: NodeJS.ProcessEnv = process.env): string {
  return (
    addressOf(env["EMAIL_REPLY_TO_FALLBACK"]) ??
    addressOf(env["EMAIL_FROM"]) ??
    DEFAULT_PLATFORM_ADDRESS
  );
}

export type ReplyToSource = "support" | "contact" | "platform";

export interface CustomerReplyTo {
  readonly address: string;
  /** Which setting it came from; "platform" means the store has none set. */
  readonly source: ReplyToSource;
}

/** The Reply-To for a store's emails to its shoppers. */
export function customerReplyTo(
  store: { readonly supportEmail: string | null; readonly contactEmail: string | null },
  env: NodeJS.ProcessEnv = process.env,
): CustomerReplyTo {
  const support = safeEmailAddress(store.supportEmail);
  if (support) return { address: support, source: "support" };
  const contact = safeEmailAddress(store.contactEmail);
  if (contact) return { address: contact, source: "contact" };
  return { address: platformReplyTo(env), source: "platform" };
}
