import { listDiscounts, type DiscountView } from "@storevia/commerce";
import { fromJSON, toDecimalString, type MoneyJson } from "@storevia/commerce/money";
import { getStore, grantedFeatures, hasPermission } from "@storevia/tenancy";
import { Icon } from "@storevia/ui/icons";
import { DataList, type DataColumn } from "@storevia/ui/data";
import { Alert, Badge, Card, EmptyState } from "@storevia/ui/surfaces";
import { Info, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { DiscountDialog, DiscountRowActions } from "@/components/settings/discount-forms";
import { PageHeader } from "@/components/shell/app-shell";
import { NAV_ICONS } from "@/components/shell/icons";
import { formatShortDate } from "@/lib/areas/dates";
import { formatMoney } from "@/lib/catalogue";
import { DISCOUNT_STATE, dateToZonedLocal, discountValueText, usageText } from "@/lib/discounts";
import { orgPath } from "@/lib/ids";
import { settingsPath } from "@/lib/settings-tabs";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Marketing" };

const LINK = "font-medium text-brand-700 underline-offset-2 hover:underline";

const decimal = (value: MoneyJson | null) => (value ? toDecimalString(fromJSON(value)) : "");

export default async function MarketingPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/marketing`);
  const eyebrow = (
    <span className="inline-flex items-center gap-2">
      <Icon icon={NAV_ICONS.marketing} size="sm" />
      {ctx.storeName}
    </span>
  );
  if (!hasPermission(ctx, "discount.read")) {
    return (
      <>
        <PageHeader eyebrow={eyebrow} title="Marketing" />
        <AccessNotice title="You don't have access to this area">
          Your role doesn&apos;t include discounts. Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const [discounts, store, granted] = await Promise.all([
    listDiscounts(ctx),
    getStore(ctx),
    grantedFeatures(ctx),
  ]);
  const locked = !granted.has("discounts");
  const canManage = hasPermission(ctx, "discount.manage") && ctx.storeStatus !== "ARCHIVED";
  const canCreate = canManage && !locked;
  const timeZone = store.timezone;
  const date = (d: Date) => formatShortDate(d, timeZone);
  const createDialog = canCreate ? (
    <DiscountDialog storeId={storeId} currency={store.currency} timeZone={timeZone} />
  ) : undefined;

  const columns: DataColumn<DiscountView>[] = [
    {
      key: "code",
      header: "Code",
      primary: true,
      cell: (d) => (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono font-medium break-all text-ink">{d.code}</span>
          {d.title && d.title !== d.code ? (
            <span className="text-caption font-normal break-words text-ink-muted">{d.title}</span>
          ) : null}
        </span>
      ),
    },
    { key: "value", header: "Discount", cell: (d) => discountValueText(d) },
    {
      key: "minimum",
      header: "Minimum",
      cell: (d) => (d.minSubtotal ? formatMoney(d.minSubtotal) : "None"),
    },
    {
      key: "dates",
      header: "Dates",
      cell: (d) => (
        <span className="whitespace-nowrap">
          {date(d.startsAt)} – {d.endsAt ? date(d.endsAt) : "no end"}
        </span>
      ),
    },
    {
      key: "usage",
      header: "Uses",
      cell: (d) => <span className="tabular-nums">{usageText(d.usageCount, d.usageLimit)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (d) => {
        const state = DISCOUNT_STATE[d.state];
        return (
          <Badge size="sm" variant="dot" tone={state.tone}>
            {state.label}
          </Badge>
        );
      },
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "end" as const,
            cell: (d: DiscountView) => (
              <DiscountRowActions
                storeId={storeId}
                currency={store.currency}
                timeZone={timeZone}
                active={d.state !== "disabled"}
                discount={{
                  id: d.id,
                  code: d.code,
                  title: d.title === d.code ? "" : d.title,
                  type: d.type,
                  value: d.type === "PERCENTAGE" ? (d.percentage ?? "") : decimal(d.amount),
                  minSubtotal: decimal(d.minSubtotal),
                  startsAt: dateToZonedLocal(d.startsAt, timeZone),
                  endsAt: d.endsAt ? dateToZonedLocal(d.endsAt, timeZone) : "",
                  usageLimit: d.usageLimit === null ? "" : String(d.usageLimit),
                  usageCount: d.usageCount,
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title="Marketing"
        description="Discount codes shoppers enter at checkout."
        meta={
          locked ? (
            <Badge variant="outline" icon={Lock}>
              Not in your plan
            </Badge>
          ) : undefined
        }
        actions={discounts.length > 0 ? createDialog : undefined}
      />
      <div className="space-y-4 lg:space-y-6">
        {locked ? (
          <Alert
            tone="info"
            icon={Lock}
            title="Discount codes aren't included in your current plan"
          >
            {discounts.length > 0
              ? "Your existing codes keep working and can still be edited, disabled or deleted, but new codes need a plan that includes discounts. "
              : "Creating discount codes needs a plan that includes them. "}
            {hasPermission(ctx, "billing.read") ? (
              <Link href={orgPath(ctx.organisationId, "/billing")} className={LINK}>
                See what your plan includes
              </Link>
            ) : (
              "Your organisation's owner can see what the plan includes."
            )}
          </Alert>
        ) : null}
        <Card className="overflow-hidden">
          <DataList
            rows={discounts}
            columns={columns}
            rowKey={(d) => d.id}
            rowTestId="discount-row"
            caption="Discount codes"
            empty={
              <EmptyState
                compact
                titleAs="h2"
                title="No discount codes yet"
                description="Create a code for a percentage or a fixed amount off the whole order, with an optional minimum, dates and usage limit."
                action={createDialog}
              />
            }
          />
        </Card>
        <p className="flex max-w-3xl items-start gap-2 text-body-sm text-ink-muted">
          <Icon icon={Info} size="sm" className="mt-0.5 shrink-0 text-ink-faint" />
          <span>
            In this release a code takes a percentage or a fixed amount off the whole order, one
            code per order. Automatic discounts, free-shipping codes, codes for specific products or
            collections and per-customer limits aren&apos;t available yet.
            {hasPermission(ctx, "settings.manage") ? (
              <>
                {" "}
                For free shipping over an amount, add a{" "}
                <Link href={settingsPath(ctx.storeId, "/shipping")} className={LINK}>
                  shipping rate
                </Link>{" "}
                with a price of 0.
              </>
            ) : null}
          </span>
        </p>
      </div>
    </>
  );
}
