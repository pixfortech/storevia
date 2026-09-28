import { listOrders, orderMetrics, type OrderListItem } from "@storevia/commerce";
import { getStore, hasPermission } from "@storevia/tenancy";
import { Stat } from "@storevia/ui/data";
import { Icon } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { Card, EmptyState } from "@storevia/ui/surfaces";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { OrderBadges, StatusBadge } from "@/components/orders/badges";
import { ListSearch } from "@/components/orders/list-search";
import { PageHeader } from "@/components/shell/app-shell";
import { formatMoney } from "@/lib/catalogue";
import {
  ARCHIVED_LABEL,
  CANCELLED_LABEL,
  formatDateTime,
  fulfilmentStatusLabel,
  ORDER_TABS,
  orderNumber,
  orderPath,
  ordersPath,
  parseOrderTab,
  paymentStatusLabel,
  orderStateLabel,
  STOCK_SHORTAGE_LABEL,
  type OrderTab,
} from "@/lib/orders";
import { formatShortDate } from "@/lib/areas/dates";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const search = await searchParams;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/orders`);
  if (!hasPermission(ctx, "order.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Orders" />
        <AccessNotice title="You don't have access to orders">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const param = (key: string) => {
    const value = search[key];
    return typeof value === "string" ? value : undefined;
  };
  const tab = parseOrderTab(param("status"));
  const q = (param("q") ?? "").trim().slice(0, 100);
  const after = param("after");
  const [page, metrics, store] = await Promise.all([
    listOrders(ctx, { status: tab, q, cursor: after }),
    orderMetrics(ctx),
    getStore(ctx),
  ]);
  const href = (changes: { status?: OrderTab; after?: string }) => {
    const next = new URLSearchParams();
    const status = changes.status ?? tab;
    if (status !== "all") next.set("status", status);
    if (q) next.set("q", q);
    if (changes.after) next.set("after", changes.after);
    const s = next.toString();
    return ordersPath(ctx.storeId, s ? `?${s}` : "");
  };
  const counts: Partial<Record<OrderTab, number>> = {
    all: page.counts.all,
    unfulfilled: page.counts.unfulfilled,
    cancelled: page.counts.cancelled,
    archived: page.counts.archived,
  };
  const filtered = Boolean(q) || tab !== "all";
  const date = (d: Date) => formatShortDate(d, store.timezone);
  const customer = (o: OrderListItem) => o.customerName ?? o.email ?? "No customer details";
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Orders"
        description="Orders placed on your storefront, newest first, with their payment and fulfilment status. Archived orders stay searchable under Archived orders."
      />
      {page.counts.all > 0 ? (
        <Card className="mb-6 px-5 py-4 sm:px-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            <Stat label="Orders today" value={metrics.ordersToday.toLocaleString("en-IN")} />
            <Stat label="Last 30 days" value={metrics.orders30d.toLocaleString("en-IN")} />
            <Stat
              label="Revenue, 30 days"
              value={formatMoney(metrics.revenue30d)}
              hint="Net of refunds"
            />
            <Stat
              label="To fulfil"
              value={metrics.unfulfilled.toLocaleString("en-IN")}
              {...(metrics.awaitingRefund > 0
                ? {
                    hint: `${metrics.awaitingRefund.toLocaleString("en-IN")} ${metrics.awaitingRefund === 1 ? "refund" : "refunds"} awaiting confirmation`,
                  }
                : {})}
            />
          </dl>
        </Card>
      ) : null}
      <LinkTabs
        label="Order status"
        className="mb-6"
        tabs={ORDER_TABS.map((t) => ({
          href: href({ status: t.value }),
          label: t.label,
          count: counts[t.value],
          current: t.value === tab,
        }))}
      />
      <Card className="overflow-hidden">
        <ListSearch
          label="Search orders"
          placeholder="Order number, email or name"
          defaultValue={q}
          keep={tab === "all" ? {} : { status: tab }}
        />
        {page.items.length === 0 ? (
          <EmptyState
            compact
            titleAs="h2"
            illustration={
              <Illustration name={filtered ? "empty-search" : "empty-orders"} size="sm" />
            }
            title={filtered ? "No orders match" : "No orders yet"}
            description={
              filtered
                ? q
                  ? "Try another order number, email or name."
                  : "No orders have this status."
                : "Orders placed on your storefront appear here."
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Orders</caption>
                <thead>
                  <tr className="text-caption font-medium text-ink-faint shadow-[inset_0_-1px_0_var(--color-line)]">
                    <th scope="col" className="h-10 pl-6 font-medium">
                      Order
                    </th>
                    <th scope="col" className="h-10 px-3 font-medium">
                      Date
                    </th>
                    <th scope="col" className="h-10 px-3 font-medium">
                      Customer
                    </th>
                    <th scope="col" className="h-10 px-3 font-medium">
                      Payment
                    </th>
                    <th scope="col" className="h-10 px-3 font-medium">
                      Fulfilment
                    </th>
                    <th
                      scope="col"
                      className="hidden h-10 px-3 text-right font-medium lg:table-cell"
                    >
                      Items
                    </th>
                    <th scope="col" className="h-10 pr-6 pl-3 text-right font-medium">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {page.items.map((o) => (
                    <tr key={o.id} data-testid="order-row" className="hover:bg-subtle">
                      <td className="py-3 pl-6 align-top">
                        <Link
                          href={orderPath(ctx.storeId, o.id)}
                          className="text-body-sm font-semibold whitespace-nowrap text-ink hover:text-brand-700 hover:underline"
                        >
                          {orderNumber(o.number)}
                        </Link>
                        {o.stockShortage ? (
                          <span className="mt-1 block">
                            <StatusBadge status={STOCK_SHORTAGE_LABEL} />
                          </span>
                        ) : null}
                        {o.archived ? (
                          <span className="mt-1 block">
                            <StatusBadge status={ARCHIVED_LABEL} />
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top text-body-sm whitespace-nowrap text-ink-muted">
                        <time
                          dateTime={o.placedAt.toISOString()}
                          title={formatDateTime(o.placedAt, store.timezone)}
                        >
                          {date(o.placedAt)}
                        </time>
                      </td>
                      <td className="max-w-56 px-3 py-3 align-top">
                        <span className="block truncate text-body-sm text-ink">{customer(o)}</span>
                        {o.customerName && o.email ? (
                          <span className="block truncate text-caption text-ink-muted">
                            {o.email}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatusBadge status={paymentStatusLabel(o.paymentStatus)} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatusBadge
                          status={
                            o.status === "CANCELLED"
                              ? CANCELLED_LABEL
                              : o.state === "COMPLETED"
                                ? orderStateLabel("COMPLETED")
                                : fulfilmentStatusLabel(o.fulfilmentStatus)
                          }
                        />
                      </td>
                      <td className="hidden px-3 py-3 text-right align-top text-body-sm text-ink-muted tabular-nums lg:table-cell">
                        {o.itemCount.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 pr-6 pl-3 text-right align-top text-body-sm font-medium whitespace-nowrap text-ink tabular-nums">
                        {formatMoney(o.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {page.items.map((o) => (
                <li key={o.id} data-testid="order-card">
                  <Link
                    href={orderPath(ctx.storeId, o.id)}
                    className="block space-y-2 px-4 py-3.5 hover:bg-subtle"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-body-sm font-semibold text-ink">
                        {orderNumber(o.number)}
                      </span>
                      <span className="shrink-0 text-body-sm font-medium text-ink tabular-nums">
                        {formatMoney(o.total)}
                      </span>
                    </span>
                    <span className="block truncate text-caption text-ink-muted">
                      {customer(o)} ·{" "}
                      <time dateTime={o.placedAt.toISOString()}>{date(o.placedAt)}</time> ·{" "}
                      {o.itemCount.toLocaleString("en-IN")} {o.itemCount === 1 ? "item" : "items"}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <OrderBadges
                        status={o.status}
                        paymentStatus={o.paymentStatus}
                        fulfilmentStatus={o.fulfilmentStatus}
                        stockShortage={o.stockShortage}
                        state={o.state}
                        archived={o.archived}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {after || page.nextCursor ? (
          <nav
            aria-label="Pages"
            className="flex items-center justify-between border-t border-line px-4 py-3 text-body-sm sm:px-6"
          >
            {after ? (
              <Link
                href={href({})}
                className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
              >
                <Icon icon={ArrowLeft} size="sm" />
                First page
              </Link>
            ) : (
              <span />
            )}
            {page.nextCursor ? (
              <Link
                href={href({ after: page.nextCursor })}
                className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
              >
                Next page
                <Icon icon={ArrowRight} size="sm" />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
