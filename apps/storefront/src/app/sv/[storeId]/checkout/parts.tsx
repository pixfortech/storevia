import type { CheckoutView } from "@storevia/commerce/checkout";
import type { ReactNode } from "react";

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

interface ShellProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error: string | undefined;
  readonly wide?: boolean | undefined;
}

/** What a control needs to be announced with its hint and error. */
export const controlProps = ({ id, hint, error }: ShellProps) => {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
};

/**
 * Label, control, then hint and error, always in that order and always three
 * rows (the last may be empty): inside a field grid each row lines up with
 * its neighbour's, so paired inputs align whatever the hints or errors.
 */
export function FieldShell(props: ShellProps & { readonly children: ReactNode }) {
  const { id, label, hint, error, wide, children } = props;
  return (
    <div className={wide ? "sv-field sv-field-wide" : "sv-field"}>
      <label htmlFor={id}>{label}</label>
      {children}
      <div className="sv-field-notes">
        {hint ? (
          <p id={`${id}-hint`} className="sv-field-hint">
            {hint}
          </p>
        ) : null}
        <FieldError id={`${id}-error`} message={error} />
      </div>
    </div>
  );
}

export function Field({
  name,
  type = "text",
  required,
  autoComplete,
  defaultValue,
  inputMode,
  ...shell
}: ShellProps & {
  name: string;
  type?: "text" | "email" | "tel";
  required?: boolean;
  autoComplete: string;
  defaultValue: string;
  inputMode?: "numeric" | undefined;
}) {
  return (
    <FieldShell {...shell}>
      <input
        {...controlProps(shell)}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        inputMode={inputMode}
      />
    </FieldShell>
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
              {u.reason === "SOLD_OUT"
                ? "sold out"
                : u.reason === "LOW_STOCK"
                  ? `only ${String(u.available ?? 0)} available`
                  : "no longer available"}
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
