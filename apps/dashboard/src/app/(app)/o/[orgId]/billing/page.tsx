import { STATUS_LABELS } from "@storevia/billing/state-machine";
import { getOrganisationBilling, hasPermission } from "@storevia/tenancy";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Icon,
  LogoMark,
  cn,
} from "@storevia/ui";
import { Building2, Check, CreditCard, FlaskConical, Minus, UserCog } from "lucide-react";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { UsageMeters } from "@/components/usage-meters";
import {
  MANAGED_BY_LABEL,
  entitlementGroups,
  planFacts,
  type EntitlementRow,
} from "@/lib/areas/billing";
import { formatLongDate } from "@/lib/areas/dates";
import { organisationContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Billing" };

// Informational only (docs/architecture/05 §7, ADR-0022). No payment gateway
// is integrated, so there are no checkout, payment-method or upgrade
// controls: plan changes are made by Storevia staff.

const TONES = {
  TRIAL: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  CANCELLED: "warning",
  EXPIRED: "neutral",
} as const;

const MANAGED_ICON = { STOREVIA: Building2, TEST_BILLING: FlaskConical, PROVIDER: CreditCard };

/** Counts and storage: what the plan allows, as quiet figures. */
function LimitTiles({ rows }: { rows: readonly EntitlementRow[] }) {
  return (
    <div>
      <h3 className="text-overline text-ink-faint uppercase">Limits</h3>
      <dl className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.key} className="min-w-0 rounded-control bg-subtle px-4 py-3.5">
            <dt className="truncate text-label text-ink-muted">{row.name}</dt>
            <dd
              className={cn(
                "mt-1 truncate text-body font-semibold tabular-nums",
                row.included ? "text-ink" : "text-ink-faint",
              )}
            >
              {row.label}
            </dd>
            {row.availability ? (
              <dd className="mt-1 truncate text-caption text-ink-faint">{row.availability}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Features, each marked included or not in words as well as an icon, and,
 * when it isn't built yet, when it's planned: a plan can include a feature
 * before merchants can use it.
 */
function FeatureList({ rows }: { rows: readonly EntitlementRow[] }) {
  return (
    <div>
      <h3 className="text-overline text-ink-faint uppercase">Features</h3>
      <ul className="mt-3 grid grid-cols-1 border-t border-line md:grid-cols-2 md:gap-x-10">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-start justify-between gap-4 border-b border-line py-3 text-body-sm"
            data-included={row.included}
          >
            <span className="flex min-w-0 items-start gap-2.5">
              <Icon
                icon={row.included ? Check : Minus}
                size="sm"
                className={cn("mt-0.5", row.included ? "text-brand-600" : "text-ink-faint")}
              />
              <span className="min-w-0">
                <span className={cn("block", row.included ? "text-ink" : "text-ink-muted")}>
                  {row.name}
                </span>
                {row.availability ? (
                  <Badge size="sm" variant="outline" className="mt-1.5">
                    {row.availability}
                  </Badge>
                ) : null}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 text-right",
                row.included ? "text-ink-muted" : "text-ink-faint",
              )}
            >
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function BillingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}/billing`);
  if (!hasPermission(ctx, "billing.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.organisationName} title="Billing" />
        <AccessNotice title="You can't view billing">
          Only the owner and admins of {ctx.organisationName} can see its plan and usage.
        </AccessNotice>
      </>
    );
  }
  const billing = await getOrganisationBilling(ctx);
  const sub = billing.subscription;
  const { limits, features } = entitlementGroups(billing.entitlements);
  const over = billing.usage.filter((l) => l.overLimit);

  const alerts = [
    sub?.status === "PAST_DUE" ? (
      <Alert key="past-due" tone="warning" title="Payment is overdue">
        Your plan stays active until {sub.graceEndsAt ? formatLongDate(sub.graceEndsAt) : null}.
        Contact Storevia to keep it.
      </Alert>
    ) : null,
    sub?.status === "CANCELLED" ? (
      <Alert key="cancelled" tone="warning" title="Your plan is cancelled">
        You keep its features until {sub.expiresAt ? formatLongDate(sub.expiresAt) : null}.
      </Alert>
    ) : null,
    over.length > 0 ? (
      <Alert key="over" tone="danger" title="You're over your plan's limits">
        {over.map((l) => l.name.toLowerCase()).join(" and ")}: nothing has been removed and
        everything keeps working, but you can't add more until you&apos;re within your plan&apos;s
        limits.
      </Alert>
    ) : null,
  ].filter(Boolean);

  const ManagedIcon = sub ? MANAGED_ICON[sub.managedBy] : null;

  return (
    <>
      <PageHeader
        eyebrow={ctx.organisationName}
        title="Billing"
        description="Your Storevia plan, what it includes and how much of it you use."
      />
      {alerts.length > 0 ? <div className="mb-6 space-y-3 lg:mb-8">{alerts}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start xl:gap-8">
        <div className="min-w-0 space-y-6">
          <Card data-testid="plan-card" className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-subtle ring-1 ring-line ring-inset">
                  <LogoMark aria-hidden="true" className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-overline text-ink-faint uppercase">
                    {sub ? "Current plan" : "Free allowance"}
                  </p>
                  <h2 className="mt-1 font-display text-h3 text-ink">
                    {sub ? sub.planName : "No plan"}
                  </h2>
                </div>
              </div>
              {sub ? (
                <Badge variant="dot" tone={TONES[sub.status]} data-testid="plan-status">
                  {STATUS_LABELS[sub.status]}
                </Badge>
              ) : null}
            </div>
            <div className="border-t border-line bg-subtle px-5 py-5 sm:px-6">
              {sub && ManagedIcon ? (
                <>
                  <p className="flex items-center gap-2 text-body-sm font-medium text-ink">
                    <Icon icon={ManagedIcon} size="sm" className="text-ink-faint" />
                    {MANAGED_BY_LABEL[sub.managedBy]}
                  </p>
                  <DescriptionList
                    layout="stacked"
                    columns={3}
                    className="mt-5 gap-y-5"
                    items={planFacts(sub)}
                  />
                </>
              ) : (
                <p className="text-body-sm text-ink-muted">
                  Your organisation uses Storevia&apos;s free allowance: one store and one team
                  member.
                </p>
              )}
            </div>
          </Card>

          <Card data-testid="usage-card">
            <CardHeader
              title="Usage"
              description={`Counted across every store in ${ctx.organisationName}.`}
            />
            <CardBody className="py-6">
              <UsageMeters usage={billing.usage} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="What your plan includes"
              description="Limits and features apply to your whole organisation. Most features are still being built: each shows when it's planned, and it switches on for your plan when it launches."
            />
            <CardBody className="space-y-8 py-6">
              <LimitTiles rows={limits} />
              <FeatureList rows={features} />
            </CardBody>
          </Card>
        </div>

        <Card data-testid="payments-card" className="xl:sticky xl:top-24">
          <CardHeader
            icon={
              <span className="flex size-9 items-center justify-center rounded-control bg-subtle text-ink-muted ring-1 ring-line ring-inset">
                <Icon icon={CreditCard} size="sm" />
              </span>
            }
            title="Payments and invoices"
          />
          <CardBody className="space-y-5">
            <p className="text-body-sm text-ink-muted">
              Online payments aren&apos;t available yet, and nothing is charged here. To change your
              plan, contact Storevia support.
            </p>
            <ul className="space-y-3 border-t border-line pt-4 text-body-sm text-ink-muted">
              <li className="flex gap-2.5">
                <Icon icon={CreditCard} size="sm" className="mt-0.5 text-ink-faint" />
                No payment method is stored for {ctx.organisationName}.
              </li>
              <li className="flex gap-2.5">
                <Icon icon={UserCog} size="sm" className="mt-0.5 text-ink-faint" />
                Storevia staff make plan changes for you.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
