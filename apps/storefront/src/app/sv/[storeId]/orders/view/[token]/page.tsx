import { formatPrice } from "@storevia/commerce/blocks";
import { getCustomerOrder, ORDER_MESSAGE_MAX } from "@storevia/commerce/customer-order";
import {
  DELIVERY_LABELS,
  METHOD_LABELS,
  SHIPMENT_LABELS,
} from "@storevia/commerce/order-lifecycle";
import { isBrowsable, requestStore } from "@storevia/site-engine/request";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { sendOrderMessage } from "./actions";

// The shopper's own order page (post-M7), opened only by the private link
// in their confirmation email or on the thank-you page. The token opens this
// one order in this store; an order number or email address never does.
// What it shows is a customer-safe subset: no staff notes, audit data,
// provider or internal ids, or staff names. Never indexed, never cached.

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const PAYMENT_LABELS: Readonly<Record<string, string>> = {
  PENDING: "Awaiting payment",
  AUTHORIZED: "Authorised",
  PAID: "Paid",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  VOIDED: "Voided",
  FAILED: "Failed",
};

const MILESTONES: Readonly<Record<string, string>> = {
  placed: "Order placed",
  paid: "Payment received",
  fulfilled: "Packed",
  shipped: "Shipped",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  completed: "Order complete",
  cancelled: "Order cancelled",
  refunded: "Refund issued",
};

const ERRORS: Readonly<Record<string, string>> = {
  rate: "You've sent several messages recently. Please wait a while before sending another.",
  long: `Keep your message under ${ORDER_MESSAGE_MAX.toLocaleString("en")} characters.`,
  empty: "Write a message before sending.",
};

export default async function CustomerOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId, token } = await params;
  const store = await requestStore(storeId);
  if (!isBrowsable(store)) redirect("/");
  const order = await getCustomerOrder(
    { organisationId: store.organisationId, storeId: store.storeId },
    token,
  );
  if (!order) notFound();
  const query = await searchParams;
  const sent = query["sent"] === "1";
  const error = typeof query["error"] === "string" ? ERRORS[query["error"]] : undefined;

  const money = (amount: bigint) =>
    formatPrice({ amount: amount.toString(), currency: order.currency }, store.locale);
  const date = (d: Date) =>
    new Intl.DateTimeFormat(store.locale, { dateStyle: "medium" }).format(d);
  const dateTime = (d: Date) =>
    new Intl.DateTimeFormat(store.locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
  const stateLabel =
    order.state === "COMPLETED" ? "Complete" : order.state === "CANCELLED" ? "Cancelled" : "Open";

  return (
    <main id="main" className="sv-container sv-checkout sv-order-view" data-order-view>
      <h1>{`Order #${String(order.number)}`}</h1>
      <p className="sv-order-meta">
        Placed {date(order.placedAt)} · <span data-order-state>{stateLabel}</span>
      </p>
      <dl className="sv-order-statuses">
        <div>
          <dt>Payment</dt>
          <dd data-status="payment">
            {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
          </dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd data-status="delivery">{DELIVERY_LABELS[order.deliveryStatus]}</dd>
        </div>
      </dl>

      <div className="sv-checkout-grid">
        <div>
          <section aria-labelledby="shipments-heading" className="sv-checkout-step">
            <h2 id="shipments-heading">Delivery</h2>
            {order.shipments.length === 0 ? (
              <p>
                {order.state === "CANCELLED"
                  ? "This order was cancelled."
                  : "We're preparing your order. You'll see delivery details here once it's on its way."}
              </p>
            ) : (
              <ul className="sv-order-shipments">
                {order.shipments.map((s, i) => (
                  <li key={i} data-shipment={s.status}>
                    <p>
                      <strong>{SHIPMENT_LABELS[s.status]}</strong> · {METHOD_LABELS[s.method]}
                      {s.deliveredAt ? ` · delivered ${date(s.deliveredAt)}` : ""}
                      {!s.deliveredAt && s.shippedAt ? ` · sent ${date(s.shippedAt)}` : ""}
                    </p>
                    {s.carrier || s.trackingNumber ? (
                      <p data-tracking>
                        {s.carrier ? `${s.carrier} ` : ""}
                        {s.trackingNumber ? (
                          s.trackingUrl ? (
                            <a
                              href={s.trackingUrl}
                              rel="noopener noreferrer nofollow"
                              target="_blank"
                            >
                              {s.trackingNumber}
                            </a>
                          ) : (
                            s.trackingNumber
                          )
                        ) : null}
                      </p>
                    ) : null}
                    <p className="sv-field-hint">
                      {s.items.map((it) => `${String(it.quantity)} × ${it.title}`).join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="timeline-heading" className="sv-checkout-step">
            <h2 id="timeline-heading">Progress</h2>
            <ol className="sv-order-timeline">
              {order.timeline.map((t) => (
                <li key={t.kind} data-milestone={t.kind}>
                  <span>{MILESTONES[t.kind] ?? t.kind}</span>{" "}
                  <time dateTime={t.at.toISOString()}>{dateTime(t.at)}</time>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="messages-heading" className="sv-checkout-step" id="messages">
            <h2 id="messages-heading">Messages</h2>
            {order.messages.length === 0 ? (
              <p className="sv-field-hint">
                Need to tell the store something about this order, like a delivery time? Send them a
                message.
              </p>
            ) : (
              <ol className="sv-order-messages">
                {order.messages.map((m, i) => (
                  <li key={i} data-from={m.from}>
                    <p className="sv-field-hint">
                      {m.from === "customer" ? "You" : store.name} ·{" "}
                      <time dateTime={m.at.toISOString()}>{dateTime(m.at)}</time>
                    </p>
                    {/* Plain text, rendered as text (never HTML). */}
                    <p className="sv-order-message-body">{m.body}</p>
                  </li>
                ))}
              </ol>
            )}
            {sent ? (
              <p role="status" className="sv-order-notice">
                Message sent. The store will reply by email.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="sv-field-error" id="body-error">
                {error}
              </p>
            ) : null}
            <form action={sendOrderMessage.bind(null, token)}>
              <div className="sv-field">
                <label htmlFor="body">Message to the store</label>
                <textarea
                  id="body"
                  name="body"
                  rows={4}
                  required
                  maxLength={ORDER_MESSAGE_MAX}
                  aria-describedby={error ? "body-hint body-error" : "body-hint"}
                  aria-invalid={error ? true : undefined}
                />
                <p id="body-hint" className="sv-field-hint">
                  Plain text, up to {ORDER_MESSAGE_MAX.toLocaleString("en")} characters.
                </p>
              </div>
              <div>
                <button type="submit" className="sv-button">
                  Send message
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside aria-labelledby="summary-heading" className="sv-checkout-summary">
          <h2 id="summary-heading">Summary</h2>
          <ul className="sv-summary-lines">
            {order.lines.map((l, i) => (
              <li key={i}>
                <span>
                  {l.quantity} × {l.title}
                  {l.variant ? <span className="sv-field-hint"> ({l.variant})</span> : null}
                </span>
                <span>{money(l.total)}</span>
              </li>
            ))}
          </ul>
          <dl className="sv-summary-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(order.subtotal)}</dd>
            </div>
            {order.discount > 0n ? (
              <div>
                <dt>Discount</dt>
                <dd>−{money(order.discount)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Shipping</dt>
              <dd>{money(order.shipping)}</dd>
            </div>
            <div>
              <dt>{order.pricesIncludeTax ? "Tax (included)" : "Tax"}</dt>
              <dd>{money(order.tax)}</dd>
            </div>
            <div className="sv-summary-total">
              <dt>Total</dt>
              <dd data-order-total>{money(order.total)}</dd>
            </div>
            {order.refunded > 0n ? (
              <div>
                <dt>Refunded</dt>
                <dd>−{money(order.refunded)}</dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>
    </main>
  );
}
