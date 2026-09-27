import type { CheckoutView } from "@storevia/commerce/checkout";

// Checkout building blocks: labelled fields with their errors announced
// (aria-invalid + aria-describedby), and the order summary. Server
// components; no client JavaScript.

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="sv-field-error">
      {message}
    </p>
  ) : null;
}

export function Field({
  id,
  name,
  label,
  hint,
  error,
  type = "text",
  required,
  wide,
  autoComplete,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error: string | undefined;
  type?: "text" | "email" | "tel";
  required?: boolean;
  wide?: boolean;
  autoComplete: string;
  defaultValue: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={wide ? "sv-field sv-field-wide" : "sv-field"}>
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className="sv-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function CheckoutSummary({
  view,
  price,
}: {
  view: CheckoutView;
  price: (p: { amount: string; currency: string }) => string;
}) {
  return (
    <aside className="sv-checkout-summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Order summary</h2>
      <ul className="sv-summary-lines">
        {view.lines.map((line) => (
          <li key={line.variantId}>
            <span>
              {line.productTitle}
              {line.variantTitle && line.variantTitle !== "Default" ? (
                <span className="sv-muted"> · {line.variantTitle}</span>
              ) : null}
              <span className="sv-muted"> × {line.quantity}</span>
            </span>
            <span>{price(line.subtotal)}</span>
          </li>
        ))}
      </ul>
      {view.unavailable.length > 0 ? (
        <ul className="sv-summary-unavailable" aria-label="Not included">
          {view.unavailable.map((u, i) => (
            <li key={`${u.productTitle}-${String(i)}`} className="sv-muted">
              {u.productTitle} × {u.quantity} —{" "}
              {u.reason === "SOLD_OUT" ? "sold out" : "no longer available"}
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="sv-summary-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{price(view.subtotal)}</dd>
        </div>
        {view.discount ? (
          <div>
            <dt>Discount ({view.discount.code})</dt>
            <dd>−{price(view.discount.amount)}</dd>
          </div>
        ) : null}
        {view.requiresShipping ? (
          <div>
            <dt>Shipping{view.shipping ? ` (${view.shipping.name})` : ""}</dt>
            <dd>
              {view.shipping
                ? view.shipping.amount.amount === "0"
                  ? "Free"
                  : price(view.shipping.amount)
                : "Calculated after address"}
            </dd>
          </div>
        ) : null}
        {view.taxLines.map((t) => (
          <div key={t.name}>
            <dt>
              {t.name}
              {view.pricesIncludeTax ? " (included)" : ""}
            </dt>
            <dd>{price(t.amount)}</dd>
          </div>
        ))}
        <div className="sv-summary-total">
          <dt>Total</dt>
          <dd>{price(view.total)}</dd>
        </div>
      </dl>
    </aside>
  );
}
