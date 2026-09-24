import { STATUS_LABELS } from "@storevia/billing/state-machine";
import { getOrganisationBilling, hasPermission } from "@storevia/tenancy";
import { formatEntitlement } from "@storevia/entitlements/format";
import { Alert, Badge, Card, CardBody, CardHeader } from "@storevia/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { UsageMeters } from "@/components/usage-meters";
import { organisationContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Billing" };

// Informational only (docs/architecture/05 §7, ADR-0022). No payment gateway
// is integrated, so there are no checkout, payment-method or upgrade
// controls: plan changes are made by Storevia staff.

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const date = (d: Date | null) => (d ? DATE.format(d) : null);
const TONES = {
  TRIAL: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  CANCELLED: "warning",
  EXPIRED: "neutral",
} as const;
const MANAGED_BY = {
  STOREVIA: "Managed by Storevia",
  TEST_BILLING: "Test billing (simulated)",
  PROVIDER: "Billed online",
} as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

export default async function BillingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}/billing`);
  if (!hasPermission(ctx, "billing.read")) {
    return (
      <>
        <PageHeader title="Billing" />
        <Alert tone="warning" title="You can't view billing">
          Only the owner and admins of {ctx.organisationName} can see its plan and usage.
        </Alert>
      </>
    );
  }
  const billing = await getOrganisationBilling(ctx);
  const sub = billing.subscription;
  const included = billing.entitlements
    .map((e) => ({ key: e.key, name: e.name, label: formatEntitlement(e.key, e.value) }))
    .filter((e) => e.label !== null);
  const over = billing.usage.filter((l) => l.overLimit);

  return (
    <>
      <PageHeader title="Billing" description="Your Storevia plan, its limits and your usage." />
      <div className="max-w-3xl space-y-6">
        {sub?.status === "PAST_DUE" ? (
          <Alert tone="warning" title="Payment is overdue">
            Your plan stays active until {date(sub.graceEndsAt)}. Contact Storevia to keep it.
          </Alert>
        ) : null}
        {sub?.status === "CANCELLED" ? (
          <Alert tone="warning" title="Your plan is cancelled">
            You keep its features until {date(sub.expiresAt)}.
          </Alert>
        ) : null}
        {over.length > 0 ? (
          <Alert tone="danger" title="You're over your plan's limits">
            {over.map((l) => l.name.toLowerCase()).join(" and ")}: nothing has been removed and
            everything keeps working, but you can't add more until you're within your plan's limits.
          </Alert>
        ) : null}

        <Card data-testid="plan-card">
          <CardHeader
            title={sub ? sub.planName : "No plan"}
            description={
              sub
                ? MANAGED_BY[sub.managedBy]
                : "Your organisation uses Storevia's free allowance: one store and one team member."
            }
            actions={
              sub ? (
                <Badge tone={TONES[sub.status]} data-testid="plan-status">
                  {STATUS_LABELS[sub.status]}
                </Badge>
              ) : null
            }
          />
          {sub ? (
            <CardBody>
              <dl className="divide-y divide-line">
                {!sub.entitling ? (
                  <Row label="Plan features">Ended. Free allowance applies</Row>
                ) : null}
                <Row label="Billing">
                  {sub.billingInterval === "YEAR"
                    ? "Annual"
                    : sub.billingInterval === "MONTH"
                      ? "Monthly"
                      : "By agreement"}
                </Row>
                <Row label="Started">{date(sub.startedAt)}</Row>
                {sub.status === "TRIAL" ? (
                  <Row label="Trial ends">{date(sub.trialEndsAt)}</Row>
                ) : null}
                {sub.status !== "CANCELLED" && sub.currentPeriodEnd ? (
                  <Row label="Renews">{date(sub.currentPeriodEnd)}</Row>
                ) : null}
                {sub.expiresAt ? (
                  <Row label={sub.status === "CANCELLED" ? "Access ends" : "Expires"}>
                    {date(sub.expiresAt)}
                  </Row>
                ) : null}
              </dl>
            </CardBody>
          ) : null}
        </Card>

        <Card data-testid="usage-card">
          <CardHeader title="Usage" />
          <CardBody>
            <UsageMeters usage={billing.usage} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Included in your plan" />
          <CardBody>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {included.map((f) => (
                <li
                  key={f.key}
                  className="flex justify-between gap-3 rounded-control bg-subtle px-3 py-2"
                >
                  <span>{f.name}</span>
                  <span className="text-ink-muted">{f.label}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card data-testid="payments-card">
          <CardHeader title="Payments and invoices" />
          <CardBody>
            <p className="text-sm text-ink-muted">
              Online payments aren't available yet, and nothing is charged here. To change your
              plan, contact Storevia support.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
