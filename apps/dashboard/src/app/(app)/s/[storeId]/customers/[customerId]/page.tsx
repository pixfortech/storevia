import { getCustomer, type CustomerDetail } from "@storevia/commerce";
import { getStore, hasPermission } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/areas/access-notice";
import { OrderBadges } from "@/components/orders/badges";
import { CustomerNotesForm, EraseCustomerForm } from "@/components/orders/customer-form";
import { PageHeader } from "@/components/shell/app-shell";
import { formatMoney } from "@/lib/catalogue";
import { formatLongDate, formatShortDate } from "@/lib/areas/dates";
import { customersPath, orderNumber, orderPath } from "@/lib/orders";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ storeId: string; customerId: string }>;
}) {
  const { storeId, customerId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/customers/${customerId}`);
  if (!hasPermission(ctx, "customer.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Customer" />
        <AccessNotice title="You don't have access to customers">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  let customer: CustomerDetail;
  try {
    customer = await getCustomer(ctx, customerId);
  } catch (error) {
    // Another store's customer, a removed one or a malformed id: not found.
    if (isDomainError(error)) notFound();
    throw error;
  }
  const store = await getStore(ctx);
  const canManage =
    hasPermission(ctx, "customer.manage") &&
    ctx.storeStatus !== "ARCHIVED" &&
    ctx.storeStatus !== "SUSPENDED";
  const canSeeOrders = hasPermission(ctx, "order.read");
  const title = customer.name ?? customer.email ?? "Unnamed customer";
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={customersPath(ctx.storeId)} className="hover:text-ink">
            Customers
          </Link>
        }
        title={title}
        description={`Customer since ${formatLongDate(customer.createdAt, store.timezone)}.`}
        meta={
          customer.tags.length > 0 ? (
            <>
              <span className="sr-only">Tags:</span>
              {customer.tags.map((t) => (
                <Badge key={t} size="sm" variant="outline">
                  {t}
                </Badge>
              ))}
            </>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0 self-start">
          <CardHeader
            title="Orders"
            description={customer.orders.length >= 50 ? "The 50 most recent orders." : undefined}
          />
          {customer.orders.length === 0 ? (
            <EmptyState
              compact
              titleAs="h3"
              title="No orders"
              description="This customer's orders will appear here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {customer.orders.map((o) => {
                const status = o.status === "CANCELLED" ? "CANCELLED" : "OPEN";
                const content = (
                  <>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-body-sm font-semibold text-ink">
                        {orderNumber(o.number)}
                        <span className="font-normal text-ink-faint">
                          {" · "}
                          <time dateTime={o.placedAt.toISOString()}>
                            {formatShortDate(o.placedAt, store.timezone)}
                          </time>
                        </span>
                      </span>
                      <span className="shrink-0 text-body-sm font-medium text-ink tabular-nums">
                        {formatMoney(o.total)}
                      </span>
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <OrderBadges
                        status={status}
                        paymentStatus={o.paymentStatus}
                        fulfilmentStatus={o.fulfilmentStatus}
                        stockShortage={false}
                        testMode={o.testMode}
                      />
                    </span>
                  </>
                );
                return (
                  <li key={o.id}>
                    {canSeeOrders ? (
                      <Link
                        href={orderPath(ctx.storeId, o.id)}
                        className="block px-5 py-3.5 hover:bg-subtle sm:px-6"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="px-5 py-3.5 sm:px-6">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <CardBody className="space-y-2 text-body-sm">
              {customer.email ? (
                <p className="break-all">
                  <a href={`mailto:${customer.email}`} className="text-brand-700 hover:underline">
                    {customer.email}
                  </a>
                </p>
              ) : null}
              {customer.phone ? (
                <p>
                  <a href={`tel:${customer.phone}`} className="text-brand-700 hover:underline">
                    {customer.phone}
                  </a>
                </p>
              ) : null}
              {!customer.email && !customer.phone ? (
                <p className="text-ink-muted">No contact details.</p>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Note and tags" />
            <CardBody>
              {canManage ? (
                <CustomerNotesForm
                  storeId={storeId}
                  customerId={customer.id}
                  note={customer.note ?? ""}
                  tags={customer.tags}
                />
              ) : (
                <div className="space-y-2 text-body-sm">
                  <p className="break-words whitespace-pre-line text-ink">
                    {customer.note ?? <span className="text-ink-muted">No note.</span>}
                  </p>
                  {customer.tags.length === 0 ? <p className="text-ink-muted">No tags.</p> : null}
                </div>
              )}
            </CardBody>
          </Card>
          {hasPermission(ctx, "customer.manage") ? (
            <Card data-testid="erase-customer">
              <CardHeader
                title="Erase personal data"
                description="For a customer who asks to be forgotten."
              />
              <CardBody>
                <EraseCustomerForm storeId={storeId} customerId={customer.id} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
