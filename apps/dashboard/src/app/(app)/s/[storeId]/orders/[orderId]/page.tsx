import {
  demoOrderDeletionEnabled,
  getOrder,
  listLocations,
  METHOD_LABELS,
  ORDER_MESSAGE_MAX,
  orderMessages,
  type OrderDetail,
} from "@storevia/commerce";
import {
  fromJSON,
  subtract,
  toDecimalString,
  toJSON,
  type MoneyJson,
} from "@storevia/commerce/money";
import { getStore, hasPermission } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { Alert, Card, CardBody, CardHeader } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/areas/access-notice";
import { OrderStatusPanel, StatusBadge } from "@/components/orders/badges";
import { CancelOrderDialog } from "@/components/orders/cancel-dialog";
import { FulfilDialog } from "@/components/orders/fulfil-dialog";
import {
  ArchiveOrderButton,
  CompleteOrderDialog,
  DeleteDemoOrderDialog,
  EditFulfilmentDialog,
  FulfilmentStepButton,
  ReplyForm,
} from "@/components/orders/operations";
import { OrderNoteForm, ResolveRefundButtons } from "@/components/orders/order-forms";
import { RefundDialog } from "@/components/orders/refund-dialog";
import { PageHeader } from "@/components/shell/app-shell";
import { formatMoney, inventoryPath, productPath } from "@/lib/catalogue";
import { COUNTRY_OPTIONS } from "@/lib/options";
import {
  addressLines,
  customerPath,
  formatDateTime,
  orderNumber,
  ordersPath,
  paymentRecordLabel,
  providerLabel,
  refundStatusLabel,
  shipmentStatusLabel,
  STOCK_SHORTAGE_LABEL,
} from "@/lib/orders";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Order" };

type OrderAddressView = NonNullable<OrderDetail["shippingAddress"]>;

const positive = (m: MoneyJson) => BigInt(m.amount) > 0n;
const decimal = (m: MoneyJson) => toDecimalString(fromJSON(m));
const countryName = (code: string) => COUNTRY_OPTIONS.find((c) => c.value === code)?.label ?? code;

function sameAddress(a: OrderAddressView | null, b: OrderAddressView | null): boolean {
  if (!a || !b) return false;
  return (Object.keys(a) as (keyof OrderAddressView)[]).every((k) => a[k] === b[k]);
}

function Address({ address }: { address: OrderAddressView }) {
  return (
    <address className="text-body-sm leading-relaxed text-ink not-italic">
      {addressLines(address, countryName).map((line, i) => (
        <span key={i} className="block break-words">
          {line}
        </span>
      ))}
      {address.phone ? <span className="block text-ink-muted">{address.phone}</span> : null}
    </address>
  );
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ storeId: string; orderId: string }>;
}) {
  const { storeId, orderId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/orders/${orderId}`);
  if (!hasPermission(ctx, "order.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Order" />
        <AccessNotice title="You don't have access to orders">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  let order: OrderDetail;
  try {
    order = await getOrder(ctx, orderId);
  } catch (error) {
    // Another store's order or a malformed id: not found.
    if (isDomainError(error)) notFound();
    throw error;
  }
  const writable = ctx.storeStatus !== "ARCHIVED" && ctx.storeStatus !== "SUSPENDED";
  const canManage = hasPermission(ctx, "order.manage") && writable;
  const canRefund = hasPermission(ctx, "order.refund") && writable;
  const canSeeCustomer = hasPermission(ctx, "customer.read");
  const canSeeProducts = hasPermission(ctx, "product.read");
  const canMessage = hasPermission(ctx, "order.message") && writable;
  const [store, locations, messages] = await Promise.all([
    getStore(ctx),
    canRefund && hasPermission(ctx, "inventory.read") ? listLocations(ctx) : Promise.resolve([]),
    // Opening the order marks the customer's messages (and your notifications) read.
    orderMessages(ctx, order.id, { markRead: true }),
  ]);
  const time = (d: Date) => formatDateTime(d, store.timezone);
  const label = orderNumber(order.number);
  const open = order.status === "OPEN";

  // What the actions may offer.
  const fulfilLines = open
    ? order.lines
        .filter((l) => l.quantity > l.fulfilledQuantity)
        .map((l) => ({
          id: l.id,
          title: l.productTitle,
          variantTitle: l.variantTitle,
          sku: l.sku,
          remaining: l.quantity - l.fulfilledQuantity,
        }))
    : [];
  const refundPayments = order.payments
    .filter((p) => p.status === "CAPTURED" && positive(p.refundable))
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map((p) => ({
      id: p.id,
      label: `${providerLabel(p.provider)} · ${formatMoney(p.captured)} captured`,
      refundable: decimal(p.refundable),
      refundableText: formatMoney(p.refundable),
    }));
  const refundLines = order.lines
    .filter((l) => l.quantity > l.refundedQuantity)
    .map((l) => ({
      id: l.id,
      title: l.productTitle,
      variantTitle: l.variantTitle,
      refundable: l.quantity - l.refundedQuantity,
      restockable: l.restockable,
    }));
  const activeLocations = locations
    .filter((l) => l.isActive)
    .sort((a, b) => Number(b.fulfilsOnlineOrders) - Number(a.fulfilsOnlineOrders));
  const primary = order.payments.find((p) => p.primary);
  const cancelRefundable =
    canRefund && primary && positive(primary.refundable) ? formatMoney(primary.refundable) : null;
  const net = positive(order.refunded)
    ? toJSON(subtract(fromJSON(order.total), fromJSON(order.refunded)))
    : null;
  const shippingName = order.shippingAddress
    ? [order.shippingAddress.firstName, order.shippingAddress.lastName].filter(Boolean).join(" ")
    : "";

  const canComplete = canManage && order.state === "OPEN";
  const actions = [
    canManage && fulfilLines.length > 0 ? (
      <FulfilDialog
        key="fulfil"
        storeId={storeId}
        orderId={order.id}
        orderLabel={label}
        lines={fulfilLines}
      />
    ) : null,
    canRefund && refundPayments.length > 0 ? (
      <RefundDialog
        key="refund"
        storeId={storeId}
        orderId={order.id}
        orderLabel={label}
        currency={order.total.currency}
        payments={refundPayments}
        lines={refundLines}
        locations={activeLocations.map((l) => ({ id: l.id, name: l.name }))}
        defaultLocationId={activeLocations[0]?.id ?? ""}
      />
    ) : null,
    canManage && order.canCancel ? (
      <CancelOrderDialog
        key="cancel"
        storeId={storeId}
        orderId={order.id}
        orderLabel={label}
        refundable={cancelRefundable}
      />
    ) : null,
    canComplete ? (
      <CompleteOrderDialog
        key="complete"
        storeId={storeId}
        orderId={order.id}
        orderLabel={label}
        blockers={order.completionBlockers}
      />
    ) : null,
  ].filter(Boolean);

  const totals: { term: string; value: string; strong?: boolean }[] = [
    { term: "Subtotal", value: formatMoney(order.subtotal) },
    ...(positive(order.discountTotal)
      ? [
          {
            term: `Discount${
              order.discounts.length > 0
                ? ` (${order.discounts.map((d) => d.code ?? d.title).join(", ")})`
                : ""
            }`,
            value: `−${formatMoney(order.discountTotal)}`,
          },
        ]
      : []),
    ...(order.shippingLine || positive(order.shippingTotal)
      ? [
          {
            term: `Shipping${order.shippingLine ? ` (${order.shippingLine.title})` : ""}`,
            value: positive(order.shippingTotal) ? formatMoney(order.shippingTotal) : "Free",
          },
        ]
      : []),
    ...(order.taxLines.length > 0
      ? order.taxLines.map((t) => ({
          term: `${t.title}${order.pricesIncludeTax ? " (included)" : ""}`,
          value: formatMoney(t.amount),
        }))
      : positive(order.taxTotal)
        ? [
            {
              term: `Tax${order.pricesIncludeTax ? " (included)" : ""}`,
              value: formatMoney(order.taxTotal),
            },
          ]
        : []),
    { term: "Total", value: formatMoney(order.total), strong: true },
    ...(net
      ? [
          { term: "Refunded", value: `−${formatMoney(order.refunded)}` },
          { term: "Net", value: formatMoney(net), strong: true },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={ordersPath(ctx.storeId)} className="hover:text-ink">
            Orders
          </Link>
        }
        title={`Order ${label}`}
        meta={
          order.stockShortage ? <StatusBadge status={STOCK_SHORTAGE_LABEL} size="md" /> : undefined
        }
        description={
          <>
            Placed <time dateTime={order.placedAt.toISOString()}>{time(order.placedAt)}</time>
          </>
        }
        actions={actions.length > 0 ? actions : undefined}
      />

      <Card className="mb-6 px-5 py-4 sm:px-6">
        <OrderStatusPanel
          paymentStatus={order.paymentStatus}
          fulfilmentStatus={order.fulfilmentStatus}
          deliveryStatus={order.deliveryStatus}
          state={order.state}
          archived={order.archivedAt !== null}
        />
      </Card>

      <div className="mb-6 space-y-3 empty:hidden">
        {order.stockShortage ? (
          <Alert
            tone="warning"
            title="Stock shortage"
            actions={
              hasPermission(ctx, "inventory.read") ? (
                <Link
                  href={inventoryPath(ctx.storeId)}
                  className="text-body-sm font-medium text-brand-700 hover:underline"
                >
                  Check inventory
                </Link>
              ) : undefined
            }
          >
            Some items in this order were sold with less stock than ordered. Check you have them
            before fulfilling, or refund what you can't send.
          </Alert>
        ) : null}
        {order.status === "CANCELLED" ? (
          <Alert tone="neutral" title="Cancelled">
            {order.cancelledAt ? `Cancelled ${time(order.cancelledAt)}.` : "Cancelled."}
            {order.cancelReason ? ` Reason: ${order.cancelReason}` : ""}
          </Alert>
        ) : null}
        {order.archivedAt ? (
          <Alert tone="neutral" title="Archived">
            Archived {time(order.archivedAt)}. It stays in your reports and search; restore it to
            show it in your order list again.
          </Alert>
        ) : null}
        {order.completedAt ? (
          <Alert tone="success" title="Complete">
            Completed {time(order.completedAt)}. Only tracking details and refunds can still change.
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Items"
              description={
                open && order.unfulfilledQuantity > 0
                  ? `${order.unfulfilledQuantity.toLocaleString("en-IN")} ${order.unfulfilledQuantity === 1 ? "item" : "items"} left to fulfil.`
                  : undefined
              }
            />
            <ul className="divide-y divide-line">
              {order.lines.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6"
                >
                  <div className="min-w-0">
                    {l.productId && canSeeProducts ? (
                      <Link
                        href={productPath(ctx.storeId, l.productId)}
                        className="text-body-sm font-medium break-words text-ink hover:text-brand-700 hover:underline"
                      >
                        {l.productTitle}
                      </Link>
                    ) : (
                      <p className="text-body-sm font-medium break-words text-ink">
                        {l.productTitle}
                      </p>
                    )}
                    {l.variantTitle || l.sku ? (
                      <p className="text-caption text-ink-muted">
                        {[l.variantTitle, l.sku ? `SKU ${l.sku}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-1 text-caption text-ink-muted">
                      {l.fulfilledQuantity.toLocaleString("en-IN")} of{" "}
                      {l.quantity.toLocaleString("en-IN")} fulfilled
                      {l.refundedQuantity > 0
                        ? ` · ${l.refundedQuantity.toLocaleString("en-IN")} refunded`
                        : ""}
                      {!l.requiresShipping ? " · No shipping needed" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-body-sm tabular-nums sm:text-right">
                    <p className="text-ink-muted">
                      {formatMoney(l.unitPrice)} × {l.quantity.toLocaleString("en-IN")}
                    </p>
                    {positive(l.discount) ? (
                      <p className="text-caption text-ink-muted">
                        Discount −{formatMoney(l.discount)}
                      </p>
                    ) : null}
                    <p className="font-medium text-ink">{formatMoney(l.total)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <h3 className="sr-only">Totals</h3>
              <dl className="ml-auto grid max-w-sm gap-2 text-body-sm">
                {totals.map((t) => (
                  <div key={t.term} className="flex justify-between gap-4">
                    <dt className={t.strong ? "font-semibold text-ink" : "text-ink-muted"}>
                      {t.term}
                    </dt>
                    <dd
                      className={
                        t.strong
                          ? "font-semibold whitespace-nowrap text-ink tabular-nums"
                          : "whitespace-nowrap text-ink tabular-nums"
                      }
                    >
                      {t.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            {order.payments.length === 0 ? (
              <CardBody>
                <p className="text-body-sm text-ink-muted">No payment has been recorded.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {order.payments.map((p) => (
                  <li key={p.id} className="space-y-2 px-5 py-4 sm:px-6">
                    <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                      {providerLabel(p.provider)}
                      <StatusBadge status={paymentRecordLabel(p.status)} />
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-body-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-caption text-ink-muted">Amount</dt>
                        <dd className="text-ink tabular-nums">{formatMoney(p.amount)}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-ink-muted">Captured</dt>
                        <dd className="text-ink tabular-nums">{formatMoney(p.captured)}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-ink-muted">Refunded</dt>
                        <dd className="text-ink tabular-nums">{formatMoney(p.refunded)}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-ink-muted">Captured on</dt>
                        <dd className="text-ink">
                          {p.capturedAt ? (
                            <time dateTime={p.capturedAt.toISOString()}>{time(p.capturedAt)}</time>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
            {order.refunds.length > 0 ? (
              <div className="border-t border-line px-5 py-4 sm:px-6">
                <h3 className="text-label font-semibold text-ink">Refunds</h3>
                <ul className="mt-3 space-y-4">
                  {order.refunds.map((r) => (
                    <li key={r.id} className="space-y-1.5">
                      <p className="flex flex-wrap items-center gap-2 text-body-sm">
                        <span className="font-medium text-ink tabular-nums">
                          {formatMoney(r.amount)}
                        </span>
                        <StatusBadge status={refundStatusLabel(r.status)} />
                        <time
                          dateTime={r.createdAt.toISOString()}
                          className="text-caption text-ink-faint"
                        >
                          {time(r.createdAt)}
                        </time>
                      </p>
                      {r.reason ? (
                        <p className="text-body-sm break-words text-ink-muted">
                          Reason: {r.reason}
                        </p>
                      ) : null}
                      {r.lines.length > 0 ? (
                        <p className="text-caption text-ink-muted">
                          {r.lines
                            .map(
                              (l) =>
                                `${l.productTitle} × ${l.quantity.toLocaleString("en-IN")}${l.restocked ? " (restocked)" : ""}`,
                            )
                            .join(", ")}
                        </p>
                      ) : null}
                      {r.failureMessage ? (
                        <p
                          className={
                            r.status === "FAILED"
                              ? "text-body-sm text-danger-700"
                              : "text-body-sm text-warning-700"
                          }
                        >
                          {r.failureMessage}
                        </p>
                      ) : null}
                      {r.status === "PENDING" && canRefund ? (
                        <ResolveRefundButtons
                          storeId={storeId}
                          orderId={order.id}
                          refundId={r.id}
                          amount={formatMoney(r.amount)}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {order.fulfilments.length > 0 ? (
            <Card>
              <CardHeader title="Fulfilments" />
              <ul className="divide-y divide-line">
                {order.fulfilments.map((f) => {
                  const edit = {
                    id: f.id,
                    method: f.method,
                    status: f.shipmentStatus,
                    trackingCompany: f.trackingCompany ?? "",
                    trackingNumber: f.trackingNumber ?? "",
                    trackingUrl: f.trackingUrl ?? "",
                    shippedAt: f.shippedAt?.toISOString() ?? null,
                    deliveredAt: f.deliveredAt?.toISOString() ?? null,
                  };
                  const editable = canManage && order.status === "OPEN";
                  return (
                    <li
                      key={f.id}
                      className="space-y-2 px-5 py-4 sm:px-6"
                      data-testid="fulfilment"
                      data-shipment-status={f.shipmentStatus}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={shipmentStatusLabel(f.shipmentStatus)} />
                        <p className="text-body-sm font-medium text-ink">
                          {METHOD_LABELS[f.method]} from {f.locationName}
                        </p>
                      </div>
                      <p className="text-caption text-ink-muted">
                        {f.lines
                          .map((l) => `${l.productTitle} × ${l.quantity.toLocaleString("en-IN")}`)
                          .join(", ")}
                      </p>
                      <p className="text-caption text-ink-faint">
                        Created{" "}
                        <time dateTime={f.createdAt.toISOString()}>{time(f.createdAt)}</time>
                        {f.shippedAt ? (
                          <>
                            {" · Sent "}
                            <time dateTime={f.shippedAt.toISOString()}>{time(f.shippedAt)}</time>
                          </>
                        ) : null}
                        {f.deliveredAt ? (
                          <>
                            {" · Delivered "}
                            <time dateTime={f.deliveredAt.toISOString()}>
                              {time(f.deliveredAt)}
                            </time>
                          </>
                        ) : null}
                      </p>
                      {f.trackingCompany || f.trackingNumber || f.trackingUrl ? (
                        <p className="text-body-sm break-words text-ink" data-testid="tracking">
                          {[f.trackingCompany, f.trackingNumber].filter(Boolean).join(" · ") ||
                            "Tracking"}
                          {f.trackingUrl ? (
                            <>
                              {" · "}
                              <a
                                href={f.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-brand-700 hover:underline"
                              >
                                Track shipment
                                <span className="sr-only"> (opens in a new tab)</span>
                              </a>
                            </>
                          ) : null}
                        </p>
                      ) : (
                        <p className="text-caption text-ink-faint">No tracking added.</p>
                      )}
                      {editable ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {order.state === "OPEN" ? (
                            <FulfilmentStepButton
                              storeId={storeId}
                              orderId={order.id}
                              fulfilment={edit}
                            />
                          ) : null}
                          <EditFulfilmentDialog
                            storeId={storeId}
                            orderId={order.id}
                            fulfilment={edit}
                            trackingOnly={order.state === "COMPLETED"}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card id="messages" className="scroll-mt-24">
            <CardHeader
              title="Messages"
              description="What the customer wrote from their order page, and your replies. Separate from your team's note."
            />
            <CardBody className="space-y-4">
              {messages.length === 0 ? (
                <p className="text-body-sm text-ink-muted">No messages yet.</p>
              ) : (
                <ol className="space-y-3" data-testid="order-messages">
                  {messages.map((m, i) => (
                    <li
                      key={i}
                      data-from={m.from}
                      className={
                        m.from === "customer"
                          ? "rounded-card border border-line px-4 py-3"
                          : "rounded-card border border-line bg-subtle px-4 py-3"
                      }
                    >
                      <p className="text-caption text-ink-muted">
                        {m.from === "customer" ? "Customer" : (m.authorName ?? "Your team")}
                        {" · "}
                        <time dateTime={m.createdAt.toISOString()}>{time(m.createdAt)}</time>
                      </p>
                      {/* Plain text, shown as text (never HTML). */}
                      <p className="mt-1 text-body-sm break-words whitespace-pre-wrap text-ink">
                        {m.body}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
              {canMessage && order.email ? (
                <ReplyForm storeId={storeId} orderId={order.id} max={ORDER_MESSAGE_MAX} />
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timeline" description="Newest first." />
            {order.events.length === 0 ? (
              <CardBody>
                <p className="text-body-sm text-ink-muted">Nothing has happened yet.</p>
              </CardBody>
            ) : (
              <ol className="divide-y divide-line">
                {order.events.map((e, i) => (
                  <li key={i} className="px-5 py-3 sm:px-6">
                    <p className="text-body-sm break-words text-ink">
                      {e.message ?? e.type.replace(/[._]/g, " ")}
                    </p>
                    <p className="text-caption text-ink-faint">
                      <time dateTime={e.createdAt.toISOString()}>{time(e.createdAt)}</time>
                      {e.actorName ? ` · ${e.actorName}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-3 text-body-sm">
              {shippingName ? <p className="font-medium text-ink">{shippingName}</p> : null}
              {order.email ? (
                <p className="break-all">
                  <a href={`mailto:${order.email}`} className="text-brand-700 hover:underline">
                    {order.email}
                  </a>
                </p>
              ) : null}
              {order.phone ? (
                <p>
                  <a href={`tel:${order.phone}`} className="text-brand-700 hover:underline">
                    {order.phone}
                  </a>
                </p>
              ) : null}
              {!order.email && !order.phone && !shippingName ? (
                <p className="text-ink-muted">No contact details.</p>
              ) : null}
              {order.customer ? (
                <p className="text-ink-muted">
                  {order.customer.orderCount.toLocaleString("en-IN")}{" "}
                  {order.customer.orderCount === 1 ? "order" : "orders"}
                  {canSeeCustomer ? (
                    <>
                      {" · "}
                      <Link
                        href={customerPath(ctx.storeId, order.customer.id)}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        View customer
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Shipping address" />
            <CardBody>
              {order.shippingAddress ? (
                <Address address={order.shippingAddress} />
              ) : (
                <p className="text-body-sm text-ink-muted">No shipping address.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Billing address" />
            <CardBody>
              {order.billingAddress ? (
                sameAddress(order.billingAddress, order.shippingAddress) ? (
                  <p className="text-body-sm text-ink-muted">Same as shipping address.</p>
                ) : (
                  <Address address={order.billingAddress} />
                )
              ) : (
                <p className="text-body-sm text-ink-muted">No billing address.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Note" />
            <CardBody>
              {canManage ? (
                <OrderNoteForm storeId={storeId} orderId={order.id} note={order.note ?? ""} />
              ) : order.note ? (
                <p className="text-body-sm break-words whitespace-pre-line text-ink">
                  {order.note}
                </p>
              ) : (
                <p className="text-body-sm text-ink-muted">No note.</p>
              )}
            </CardBody>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader
                title="Order record"
                description={
                  order.archivedAt
                    ? "Restore it to show it in your order list again."
                    : "Archiving hides it from your order list. Nothing is deleted; it stays in reports and search."
                }
              />
              <CardBody className="flex flex-wrap items-center gap-3">
                <ArchiveOrderButton
                  storeId={storeId}
                  orderId={order.id}
                  archived={order.archivedAt !== null}
                />
                {demoOrderDeletionEnabled() ? (
                  <DeleteDemoOrderDialog storeId={storeId} orderId={order.id} orderLabel={label} />
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
