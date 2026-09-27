import { listCustomers } from "@storevia/commerce";
import { getStore, hasPermission } from "@storevia/tenancy";
import { Icon } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { Card, EmptyState } from "@storevia/ui/surfaces";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { ListSearch } from "@/components/orders/list-search";
import { PageHeader } from "@/components/shell/app-shell";
import { formatMoney } from "@/lib/catalogue";
import { formatShortDate } from "@/lib/areas/dates";
import { customerPath, customersPath } from "@/lib/orders";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const search = await searchParams;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/customers`);
  if (!hasPermission(ctx, "customer.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Customers" />
        <AccessNotice title="You don't have access to customers">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const param = (key: string) => {
    const value = search[key];
    return typeof value === "string" ? value : undefined;
  };
  const q = (param("q") ?? "").trim().slice(0, 100);
  const after = param("after");
  const [page, store] = await Promise.all([
    listCustomers(ctx, { q, cursor: after }),
    getStore(ctx),
  ]);
  const href = (cursor?: string) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (cursor) next.set("after", cursor);
    const s = next.toString();
    return customersPath(ctx.storeId, s ? `?${s}` : "");
  };
  const date = (d: Date | null) => (d ? formatShortDate(d, store.timezone) : "—");
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Customers"
        description="Everyone who has ordered from your store, newest first. Contact details come from their orders."
      />
      <Card className="overflow-hidden">
        <ListSearch label="Search customers" placeholder="Name or email" defaultValue={q} />
        {page.items.length === 0 ? (
          <EmptyState
            compact
            titleAs="h2"
            illustration={<Illustration name={q ? "empty-search" : "empty-team"} size="sm" />}
            title={q ? "No customers match" : "No customers yet"}
            description={
              q
                ? "Try another name or email."
                : "A customer is added when someone places an order on your storefront."
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Customers</caption>
                <thead>
                  <tr className="text-caption font-medium text-ink-faint shadow-[inset_0_-1px_0_var(--color-line)]">
                    <th scope="col" className="h-10 pl-6 font-medium">
                      Customer
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-medium">
                      Orders
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-medium">
                      Total spent
                    </th>
                    <th scope="col" className="h-10 pr-6 pl-3 text-right font-medium">
                      Last order
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {page.items.map((c) => (
                    <tr key={c.id} data-testid="customer-row" className="hover:bg-subtle">
                      <td className="max-w-0 py-3 pl-6">
                        <Link
                          href={customerPath(ctx.storeId, c.id)}
                          className="block truncate text-body-sm font-medium text-ink hover:text-brand-700 hover:underline"
                        >
                          {c.name ?? c.email ?? "Unnamed customer"}
                        </Link>
                        {c.name && c.email ? (
                          <span className="block truncate text-caption text-ink-muted">
                            {c.email}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right text-body-sm text-ink-muted tabular-nums">
                        {c.orderCount.toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 py-3 text-right text-body-sm whitespace-nowrap text-ink tabular-nums">
                        {formatMoney(c.totalSpent)}
                      </td>
                      <td className="py-3 pr-6 pl-3 text-right text-body-sm whitespace-nowrap text-ink-muted">
                        {c.lastOrderAt ? (
                          <time dateTime={c.lastOrderAt.toISOString()}>{date(c.lastOrderAt)}</time>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {page.items.map((c) => (
                <li key={c.id} data-testid="customer-card">
                  <Link
                    href={customerPath(ctx.storeId, c.id)}
                    className="block space-y-1 px-4 py-3.5 hover:bg-subtle"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-body-sm font-medium text-ink">
                        {c.name ?? c.email ?? "Unnamed customer"}
                      </span>
                      <span className="shrink-0 text-body-sm text-ink tabular-nums">
                        {formatMoney(c.totalSpent)}
                      </span>
                    </span>
                    {c.name && c.email ? (
                      <span className="block truncate text-caption text-ink-muted">{c.email}</span>
                    ) : null}
                    <span className="block text-caption text-ink-faint">
                      {c.orderCount.toLocaleString("en-IN")}{" "}
                      {c.orderCount === 1 ? "order" : "orders"}
                      {c.lastOrderAt ? ` · last ${date(c.lastOrderAt)}` : ""}
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
                href={href()}
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
                href={href(page.nextCursor)}
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
