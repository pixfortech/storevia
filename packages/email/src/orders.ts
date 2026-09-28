import type { EmailMessage } from "./sender";

// Shopper emails about an order (ADR-0031 §12). Values arrive already
// formatted (money in the store's locale); everything shopper- or
// merchant-entered is escaped. Guests have no account: the one link that
// opens the order is `orderUrl`, carrying the order's opaque access token
// (never the order number or email).

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export interface OrderEmailLine {
  readonly title: string;
  readonly quantity: number;
  readonly total: string;
}

export interface OrderEmail {
  readonly storeName: string;
  readonly orderNumber: number;
  readonly lines: readonly OrderEmailLine[];
  readonly totals: readonly (readonly [label: string, value: string])[];
  readonly shippingAddress: readonly string[] | null;
  /** The shopper's order page (opaque access link), when the store has one. */
  readonly orderUrl?: string | null;
}

function orderLink(order: OrderEmail): { html: string; text: string } {
  if (!order.orderUrl) return { html: "", text: "" };
  const url = escapeHtml(order.orderUrl);
  return {
    html: `<p style="margin:0 0 16px"><a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">View your order</a></p><p style="margin:0 0 16px;color:#6b7280;font-size:13px">Keep this link private: anyone with it can see your order and send us a message about it.</p>`,
    text: `\n\nView your order: ${order.orderUrl}\n(Keep this link private: anyone with it can see your order.)`,
  };
}

function layout(storeName: string, title: string, intro: string[], body = ""): string {
  const paragraphs = intro.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px"><p style="color:#6b7280;font-size:13px;margin:0 0 8px">${escapeHtml(storeName)}</p><h1 style="font-size:20px">${escapeHtml(title)}</h1>${paragraphs}${body}<p style="color:#6b7280;font-size:13px">Sent by ${escapeHtml(storeName)} through Storevia.</p></body></html>`;
}

function orderTable(order: OrderEmail): { html: string; text: string } {
  const rows = order.lines
    .map(
      (l) =>
        `<tr><td style="padding:4px 0">${escapeHtml(l.title)} × ${String(l.quantity)}</td><td style="padding:4px 0;text-align:right">${escapeHtml(l.total)}</td></tr>`,
    )
    .join("");
  const totals = order.totals
    .map(
      ([label, value], i) =>
        `<tr><td style="padding:4px 0;${i === order.totals.length - 1 ? "font-weight:700" : ""}">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right;${i === order.totals.length - 1 ? "font-weight:700" : ""}">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const address = order.shippingAddress
    ? `<p style="margin:16px 0 4px;font-weight:600">Delivering to</p><p style="margin:0 0 16px">${order.shippingAddress.map(escapeHtml).join("<br>")}</p>`
    : "";
  const text = [
    ...order.lines.map((l) => `${l.title} × ${String(l.quantity)}  ${l.total}`),
    "",
    ...order.totals.map(([label, value]) => `${label}: ${value}`),
    ...(order.shippingAddress ? ["", "Delivering to:", ...order.shippingAddress] : []),
  ].join("\n");
  return {
    html: `<table style="width:100%;border-collapse:collapse;margin:0 0 16px">${rows}<tr><td colspan="2" style="border-top:1px solid #e5e7eb"></td></tr>${totals}</table>${address}`,
    text,
  };
}

export function orderConfirmationMessage(to: string, order: OrderEmail): EmailMessage {
  const intro = [
    `Thank you for your order #${String(order.orderNumber)}. We've received your payment and will let you know when it ships.`,
  ];
  const table = orderTable(order);
  const link = orderLink(order);
  return {
    to,
    template: "order-confirmation",
    subject: `Order #${String(order.orderNumber)} confirmed – ${order.storeName}`,
    text: `${intro.join("\n\n")}\n\n${table.text}${link.text}`,
    html: layout(order.storeName, "Thank you for your order", intro, table.html + link.html),
  };
}

/** The store answered the shopper's message about their order. */
export function orderMessageReplyMessage(to: string, order: OrderEmail, reply: string): EmailMessage {
  const intro = [`${order.storeName} replied about your order #${String(order.orderNumber)}.`];
  const link = orderLink(order);
  const quoted = `<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #e5e7eb;white-space:pre-wrap">${escapeHtml(reply)}</blockquote>`;
  return {
    to,
    template: "order-message-reply",
    subject: `A reply about order #${String(order.orderNumber)} – ${order.storeName}`,
    text: `${intro.join("\n\n")}\n\n${reply}${link.text}`,
    html: layout(order.storeName, "A reply about your order", intro, quoted + link.html),
  };
}

export function orderCancelledMessage(
  to: string,
  order: OrderEmail,
  refunded: string | null,
): EmailMessage {
  const intro = [
    `Your order #${String(order.orderNumber)} has been cancelled.`,
    refunded
      ? `A refund of ${refunded} has been issued to your original payment method. It can take a few days to appear.`
      : "If you were charged, the store will contact you about a refund.",
  ];
  return {
    to,
    template: "order-cancelled",
    subject: `Order #${String(order.orderNumber)} cancelled – ${order.storeName}`,
    text: intro.join("\n\n"),
    html: layout(order.storeName, "Your order was cancelled", intro),
  };
}

export interface ShipmentEmail {
  readonly items: readonly { readonly title: string; readonly quantity: number }[];
  readonly trackingCompany: string | null;
  readonly trackingNumber: string | null;
  readonly trackingUrl: string | null;
}

export function orderFulfilledMessage(
  to: string,
  order: OrderEmail,
  shipment: ShipmentEmail,
): EmailMessage {
  const tracking = [shipment.trackingCompany, shipment.trackingNumber].filter(Boolean).join(" ");
  const intro = [
    `Items from your order #${String(order.orderNumber)} are on their way.`,
    ...(tracking ? [`Tracking: ${tracking}`] : []),
  ];
  const safeUrl =
    shipment.trackingUrl && /^https?:\/\//i.test(shipment.trackingUrl)
      ? shipment.trackingUrl
      : null;
  const items = shipment.items
    .map((i) => `<li>${escapeHtml(i.title)} × ${String(i.quantity)}</li>`)
    .join("");
  const link = safeUrl
    ? `<p style="margin:16px 0"><a href="${escapeHtml(safeUrl)}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Track your package</a></p>`
    : "";
  return {
    to,
    template: "order-fulfilled",
    subject: `Order #${String(order.orderNumber)} is on its way – ${order.storeName}`,
    text: `${intro.join("\n\n")}\n\n${shipment.items.map((i) => `${i.title} × ${String(i.quantity)}`).join("\n")}${safeUrl ? `\n\n${safeUrl}` : ""}`,
    html: layout(order.storeName, "Your order is on its way", intro, `<ul>${items}</ul>${link}`),
  };
}

export function refundMessage(to: string, order: OrderEmail, amount: string): EmailMessage {
  const intro = [
    `We've refunded ${amount} for your order #${String(order.orderNumber)} to your original payment method.`,
    "It can take a few days for the refund to appear on your statement.",
  ];
  return {
    to,
    template: "order-refund",
    subject: `Refund for order #${String(order.orderNumber)} – ${order.storeName}`,
    text: intro.join("\n\n"),
    html: layout(order.storeName, "Your refund is on its way", intro),
  };
}
