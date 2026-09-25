import { listLocations, listMovements } from "@storevia/commerce";
import { getStore, hasPermission } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { Icon } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { Card, EmptyState } from "@storevia/ui/surfaces";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/areas/access-notice";
import { HistoryLocationFilter } from "@/components/catalogue/history-filter";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { PageHeader } from "@/components/shell/app-shell";
import { inventoryPath, inventoryTabs, MOVEMENT_REASON_LABELS, productPath } from "@/lib/catalogue";
import { formatLongDate } from "@/lib/areas/dates";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Stock history" };

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeId } = await params;
  const search = await searchParams;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/inventory/history`);
  if (!hasPermission(ctx, "inventory.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Stock history" />
        <AccessNotice title="You don't have access to inventory">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  let result;
  try {
    result = await listMovements(ctx, {
      productId: search["product"],
      locationId: search["location"],
      before: search["before"],
      limit: 50,
    });
  } catch (error) {
    if (isDomainError(error)) notFound();
    throw error;
  }
  const [locations, store] = await Promise.all([listLocations(ctx), getStore(ctx)]);
  const next = new URLSearchParams();
  for (const k of ["product", "location"]) if (search[k]) next.set(k, search[k] ?? "");
  if (result.nextCursor) next.set("before", result.nextCursor);
  const time = (d: Date) =>
    `${formatLongDate(d, store.timezone)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: store.timezone })}`;
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Inventory"
        description="Every stock change, newest first: what changed, where, why and who did it. History can't be edited."
      />
      <LinkTabs
        label="Inventory sections"
        className="mb-6"
        tabs={inventoryTabs(ctx.storeId, "history")}
      />
      <Card className="overflow-hidden">
        <HistoryLocationFilter locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
        {result.movements.length === 0 ? (
          <EmptyState
            compact
            titleAs="h2"
            illustration={<Illustration name="empty-activity" size="sm" />}
            title="No stock changes yet"
            description="Adjustments, restocks and transfers appear here as they happen."
          />
        ) : (
          <ol className="divide-y divide-line">
            {result.movements.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
              >
                <span
                  className={
                    m.delta > 0
                      ? "w-16 shrink-0 text-body-sm font-semibold text-success-700 tabular-nums"
                      : "w-16 shrink-0 text-body-sm font-semibold text-danger-700 tabular-nums"
                  }
                >
                  {m.delta > 0 ? "+" : "−"}
                  {Math.abs(m.delta).toLocaleString("en-IN")}
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={productPath(ctx.storeId, m.productId)}
                    className="block truncate text-body-sm font-medium text-ink hover:text-brand-700"
                  >
                    {m.productTitle}
                    {m.variantTitle !== "Default" ? ` · ${m.variantTitle}` : ""}
                  </Link>
                  <span className="block truncate text-caption text-ink-muted">
                    {MOVEMENT_REASON_LABELS[m.reason] ?? m.reason} at {m.locationName} · now{" "}
                    {m.resultingValue.toLocaleString("en-IN")}
                    {m.note ? ` · “${m.note}”` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-caption text-ink-faint sm:text-right">
                  {m.actorName ?? "A former member"}
                  <br className="hidden sm:block" />
                  <span className="sm:hidden"> · </span>
                  <time dateTime={m.createdAt.toISOString()}>{time(m.createdAt)}</time>
                </span>
              </li>
            ))}
          </ol>
        )}
        {result.nextCursor ? (
          <nav
            aria-label="Pages"
            className="flex justify-end border-t border-line px-4 py-3 text-body-sm sm:px-6"
          >
            <Link
              href={inventoryPath(ctx.storeId, `/history?${next.toString()}`)}
              className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
            >
              Older changes
              <Icon icon={ArrowRight} size="sm" />
            </Link>
          </nav>
        ) : null}
      </Card>
    </>
  );
}
