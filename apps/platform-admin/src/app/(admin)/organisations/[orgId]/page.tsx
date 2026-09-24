import {
  getOrganisationBillingDetail,
  STATUS_LABELS,
  type AdminOverride,
  type SubscriptionStatus,
} from "@storevia/billing";
import { isEntitling, type EntitlementValue, type FeatureKey } from "@storevia/entitlements";
import { formatEntitlement } from "@storevia/entitlements/format";
import { hasPlatformPermission } from "@storevia/tenancy/platform";
import { toTypeId } from "@storevia/types";
import { Alert, Badge, Card, CardBody, CardHeader, DataList, Meter } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import {
  dateInputValue,
  formatDate,
  formatDateTime,
  formatLimit,
  humanise,
  INTERVAL_LABELS,
  SOURCE_LABELS,
  STATUS_TONES,
} from "@/lib/format";
import {
  activateAction,
  assignPlanAction,
  cancelAction,
  changeSubscriptionAction,
  expireAction,
  reconcileUsageAction,
  removeOverrideAction,
  setOverrideAction,
  simulateAction,
} from "./actions";
import {
  OverrideManager,
  ReconcileButton,
  SimulationPanel,
  SubscriptionActions,
  type OverrideRow,
} from "./panels";

export const metadata: Metadata = { title: "Organisation" };

/** Human-readable value plus the exact stored value for staff. */
function describe(key: FeatureKey, value: EntitlementValue): { label: string; raw?: string } {
  const label = formatEntitlement(key, value) ?? "Not included";
  switch (value.kind) {
    case "LIMIT":
      return label.startsWith("Up to") || value.limit === 0n
        ? { label }
        : { label, raw: value.limit.toLocaleString("en-GB") };
    case "CONFIGURATION":
      return value.enabled ? { label, raw: JSON.stringify(value.config) } : { label };
    default:
      return { label };
  }
}

function overrideRow(o: AdminOverride, now: Date): OverrideRow {
  const value = !o.enabled
    ? "Disabled"
    : o.unlimited
      ? "Unlimited"
      : o.limit !== null
        ? `Limit ${o.limit.toString()}`
        : o.config
          ? JSON.stringify(o.config)
          : "Enabled";
  const mode = !o.enabled
    ? "disabled"
    : o.unlimited
      ? "unlimited"
      : o.limit !== null
        ? "limit"
        : o.config
          ? "config"
          : "enabled";
  const by = o.updatedByName ?? o.createdByName;
  return {
    featureKey: o.featureKey,
    featureName: o.featureName,
    value,
    mode,
    limit: o.limit?.toString() ?? "",
    config: o.config ? JSON.stringify(o.config) : "",
    reason: o.reason,
    expiresAt: dateInputValue(o.expiresAt),
    expiresLabel: o.expiresAt
      ? `${formatDateTime(o.expiresAt)}${o.expiresAt <= now ? " (expired)" : ""}`
      : "Never",
    expired: o.expiresAt !== null && o.expiresAt <= now,
    byline: `${by ? `By ${by}, ` : ""}${formatDate(o.updatedAt)}`,
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

function RiskSummary({
  items,
}: {
  items: readonly { tone: "danger" | "warning" | "info"; text: string }[];
}) {
  if (items.length === 0) {
    return (
      <p
        data-testid="risk-summary"
        className="rounded-control border border-line bg-surface px-4 py-2.5 text-sm text-ink-muted"
      >
        Nothing needs attention: subscription, limits and overrides are in order.
      </p>
    );
  }
  const dot = { danger: "bg-danger-600", warning: "bg-warning-500", info: "bg-info-500" } as const;
  return (
    <section
      aria-label="Needs attention"
      data-testid="risk-summary"
      className="rounded-control border border-line bg-surface px-4 py-3"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Needs attention
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.text} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[item.tone]}`}
            />
            {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function OrganisationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireStaff(`/organisations/${orgId}`);
  const detail = await getOrganisationBillingDetail(ctx, orgId);
  const { organisation: org, subscription: sub } = detail;
  const now = new Date();
  const canManage = hasPlatformPermission(ctx, "platform.subscription.manage");
  const canOverride = hasPlatformPermission(ctx, "platform.entitlement_override.manage");
  const canSimulate =
    detail.mockBillingEnabled && hasPlatformPermission(ctx, "platform.billing.simulate");
  const assignable = detail.plans.filter((p) => p.status === "ACTIVE");
  const status = sub?.status as SubscriptionStatus | undefined;
  const entitling = sub
    ? isEntitling({ ...sub, status: sub.status as SubscriptionStatus }, now)
    : false;
  const stepUpNeeded = (canManage || canOverride) && !ctx.principal.recentlyAuthenticated;

  const bind = <A extends unknown[], R>(fn: (orgId: string, ...args: A) => R) =>
    fn.bind(null, orgId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/organisations" className="text-sm text-ink-muted hover:underline">
          ← Organisations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
          <Badge tone={org.status === "ACTIVE" ? "success" : "danger"}>
            {humanise(org.status)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {org.ownerEmail ?? "No owner"} · {org.storeCount} store(s) · {org.memberCount} member(s) ·
          created {formatDate(org.createdAt)} ·{" "}
          <code className="font-mono text-xs">{toTypeId("organisation", org.id)}</code>
        </p>
      </div>

      <RiskSummary
        items={[
          ...(org.status !== "ACTIVE"
            ? [
                {
                  tone: "danger" as const,
                  text: `Organisation is ${humanise(org.status).toLowerCase()}.`,
                },
              ]
            : []),
          ...(sub && !entitling
            ? [
                {
                  tone: "danger" as const,
                  text: "Subscription no longer grants its plan: system defaults apply.",
                },
              ]
            : []),
          ...(sub?.status === "PAST_DUE"
            ? [
                {
                  tone: "warning" as const,
                  text: `Payment overdue. Grace ends ${formatDateTime(sub.graceEndsAt)}.`,
                },
              ]
            : []),
          ...(sub?.status === "CANCELLED"
            ? [
                {
                  tone: "warning" as const,
                  text: `Cancelled. Access ends ${formatDateTime(sub.expiresAt)}.`,
                },
              ]
            : []),
          ...detail.usage
            .filter((l) => l.overLimit)
            .map((l) => ({
              tone: "danger" as const,
              text: `Over the ${l.name.toLowerCase()} limit.`,
            })),
          ...(detail.overrides.some((o) => o.expiresAt === null || o.expiresAt > now)
            ? [
                {
                  tone: "info" as const,
                  text: `${String(detail.overrides.filter((o) => o.expiresAt === null || o.expiresAt > now).length)} active entitlement override(s).`,
                },
              ]
            : []),
          ...(sub?.source === "MOCK"
            ? [{ tone: "info" as const, text: "Subscription comes from mock billing (test only)." }]
            : []),
        ]}
      />

      {stepUpNeeded ? (
        <Alert tone="info">
          Changes need a recent password confirmation.{" "}
          <Link href="/account#confirm" className="font-medium underline">
            Confirm your password
          </Link>{" "}
          first.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="subscription-card">
          <CardHeader
            title="Subscription"
            description={sub ? undefined : "No live subscription. System defaults apply."}
            actions={
              sub && status ? (
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone={STATUS_TONES[status]} data-testid="subscription-status">
                    {STATUS_LABELS[status]}
                  </Badge>
                  <Badge data-testid="subscription-source">
                    {SOURCE_LABELS[sub.source] ?? sub.source}
                  </Badge>
                </span>
              ) : null
            }
          />
          <CardBody className="space-y-4">
            {sub ? (
              <>
                <dl className="divide-y divide-line">
                  <Row label="Plan">
                    <span data-testid="subscription-plan">{sub.planName}</span>
                  </Row>
                  <Row label="Grants entitlements now">
                    {entitling ? "Yes" : "No: past its end date"}
                  </Row>
                  <Row label="Billing interval">
                    {sub.billingInterval
                      ? INTERVAL_LABELS[sub.billingInterval]
                      : "Not billed on a cycle"}
                  </Row>
                  <Row label="Started">{formatDateTime(sub.startedAt)}</Row>
                  {sub.trialEndsAt ? (
                    <Row label="Trial ends">{formatDateTime(sub.trialEndsAt)}</Row>
                  ) : null}
                  {sub.currentPeriodEnd ? (
                    <Row label="Current period ends">{formatDateTime(sub.currentPeriodEnd)}</Row>
                  ) : null}
                  {sub.graceEndsAt ? (
                    <Row label="Grace period ends">{formatDateTime(sub.graceEndsAt)}</Row>
                  ) : null}
                  <Row label={sub.status === "CANCELLED" ? "Access ends" : "Expiry"}>
                    {sub.expiresAt ? formatDateTime(sub.expiresAt) : "No expiry"}
                  </Row>
                  {sub.providerSubscriptionId ? (
                    <Row label="Provider reference">
                      <code className="font-mono text-xs">{sub.providerSubscriptionId}</code>
                    </Row>
                  ) : null}
                </dl>
                {sub.source !== "MANUAL" ? (
                  <Alert tone="info">
                    Managed by {SOURCE_LABELS[sub.source]?.toLowerCase()}. Change it through the
                    provider
                    {detail.mockBillingEnabled ? " (use the simulator below)" : ""}.
                  </Alert>
                ) : null}
              </>
            ) : null}
            {canManage && (!sub || sub.source === "MANUAL") ? (
              <SubscriptionActions
                subscription={
                  sub
                    ? {
                        id: toTypeId("subscription", sub.id),
                        status: sub.status as SubscriptionStatus,
                        planKey: sub.planKey,
                        billingInterval: sub.billingInterval,
                        trialEndsAt: dateInputValue(sub.trialEndsAt),
                        expiresAt: dateInputValue(sub.expiresAt),
                        defaultAccessEnd: dateInputValue(
                          sub.status === "TRIAL"
                            ? sub.trialEndsAt
                            : (sub.expiresAt ?? sub.currentPeriodEnd),
                        ),
                      }
                    : null
                }
                plans={assignable}
                actions={{
                  assign: bind(assignPlanAction),
                  change: bind(changeSubscriptionAction),
                  activate: bind(activateAction),
                  cancel: bind(cancelAction),
                  expire: bind(expireAction),
                }}
              />
            ) : null}
          </CardBody>
        </Card>

        <Card data-testid="usage-card">
          <CardHeader
            title="Usage"
            description="Over a limit, existing resources keep working and new ones are blocked."
          />
          <CardBody className="space-y-4">
            {detail.usage.map((line) => (
              <div key={line.key} data-testid={`usage-${line.key}`}>
                <Meter
                  label={line.name}
                  value={Number(line.usage)}
                  max={line.limit === "unlimited" ? null : Number(line.limit)}
                  valueLabel={
                    <>
                      {line.usage.toString()} of {formatLimit(line.limit)}
                      {line.overLimit ? (
                        <Badge tone="danger" className="ml-2">
                          Over limit
                        </Badge>
                      ) : null}
                    </>
                  }
                />
              </div>
            ))}
            {canManage ? <ReconcileButton action={bind(reconcileUsageAction)} /> : null}
          </CardBody>
        </Card>
      </div>

      <Card data-testid="entitlements-card">
        <CardHeader
          title="Effective entitlements"
          description="Resolved now: override → plan of an entitling subscription → system default."
        />
        <DataList
          caption="Effective entitlements"
          rows={detail.entitlements.entitlements}
          rowKey={(e) => e.key}
          rowTestId={(e) => `entitlement-${e.key}`}
          columns={[
            {
              key: "feature",
              header: "Feature",
              primary: true,
              cell: (e) => (
                <>
                  {e.name} <span className="font-mono text-xs text-ink-faint">{e.key}</span>
                </>
              ),
            },
            {
              key: "value",
              header: "Value",
              cell: (e) => {
                const value = describe(e.key, e.value);
                return (
                  <>
                    {value.label}
                    {value.raw ? (
                      <span className="block font-mono text-xs text-ink-faint">{value.raw}</span>
                    ) : null}
                  </>
                );
              },
            },
            {
              key: "origin",
              header: "From",
              cell: (e) => (
                <>
                  <Badge
                    tone={
                      e.origin === "OVERRIDE"
                        ? "warning"
                        : e.origin === "PLAN"
                          ? "brand"
                          : "neutral"
                    }
                  >
                    {e.origin === "OVERRIDE"
                      ? "Override"
                      : e.origin === "PLAN"
                        ? "Plan"
                        : "System default"}
                  </Badge>
                  {e.overrideExpiresAt ? (
                    <span className="ml-2 text-xs text-ink-muted">
                      until {formatDate(e.overrideExpiresAt)}
                    </span>
                  ) : null}
                </>
              ),
            },
          ]}
        />
      </Card>

      <Card data-testid="overrides-card">
        <CardHeader
          title="Entitlement overrides"
          description="Per-organisation exceptions. Every change is audited."
        />
        <CardBody>
          <OverrideManager
            overrides={detail.overrides.map((o) => overrideRow(o, now))}
            features={detail.features}
            canManage={canOverride}
            actions={{ set: bind(setOverrideAction), remove: bind(removeOverrideAction) }}
          />
        </CardBody>
      </Card>

      {canSimulate ? (
        <Card data-testid="simulation-card">
          <CardHeader
            title="Mock billing simulator"
            description={`Environment: ${detail.enabledProviders.join(", ")} provider enabled`}
          />
          <CardBody>
            <SimulationPanel plans={assignable} action={bind(simulateAction)} />
          </CardBody>
        </Card>
      ) : null}

      <Card data-testid="history-card">
        <CardHeader title="Subscription history" description="Every change, whatever its source." />
        <DataList
          caption="Subscription history"
          rows={detail.events}
          rowKey={(e) => e.id}
          rowTestId="history-row"
          empty={<p className="px-5 py-4 text-sm text-ink-muted">No subscription events yet.</p>}
          columns={[
            {
              key: "when",
              header: "When",
              className: "whitespace-nowrap text-ink-muted",
              cell: (e) => formatDateTime(e.occurredAt),
            },
            {
              key: "event",
              header: "Event",
              primary: true,
              cell: (e) => (
                <>
                  <span className="font-medium">{humanise(e.type)}</span>
                  <span className="block text-xs text-ink-muted">
                    {SOURCE_LABELS[e.source] ?? e.source}
                  </span>
                </>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (e) => (
                <>
                  {e.fromStatus ? `${humanise(e.fromStatus)} → ` : ""}
                  {e.toStatus ? humanise(e.toStatus) : ""}
                </>
              ),
            },
            {
              key: "plan",
              header: "Plan",
              cell: (e) => (
                <>
                  {e.fromPlanName && e.fromPlanName !== e.toPlanName ? `${e.fromPlanName} → ` : ""}
                  {e.toPlanName}
                </>
              ),
            },
            {
              key: "by",
              header: "By",
              cell: (e) => (e.actorType === "SYSTEM" ? "System" : (e.actorName ?? "Staff")),
            },
            {
              key: "reason",
              header: "Reason",
              cell: (e) => (
                <>
                  {e.reason}
                  {e.note ? (
                    <span className="block text-xs text-ink-muted">Note: {e.note}</span>
                  ) : null}
                  {e.providerEventId ? (
                    <code className="block font-mono text-[11px] text-ink-faint">
                      {e.providerEventId}
                    </code>
                  ) : null}
                </>
              ),
            },
          ]}
        />
      </Card>

      {detail.webhookEvents.length > 0 ? (
        <Card data-testid="webhooks-card">
          <CardHeader
            title="Billing webhook deliveries"
            description="Most recent 25, from the idempotency ledger."
          />
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Received</th>
                  <th className="px-5 py-2.5 font-medium">Event</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detail.webhookEvents.map((w) => (
                  <tr key={w.providerEventId} data-testid="webhook-row">
                    <td className="whitespace-nowrap px-5 py-2 text-ink-muted">
                      {formatDateTime(w.receivedAt)}
                    </td>
                    <td className="px-5 py-2">
                      {humanise(w.type)}
                      <code className="block font-mono text-[11px] text-ink-faint">
                        {w.providerEventId}
                      </code>
                    </td>
                    <td className="px-5 py-2">
                      {humanise(w.status)}
                      {w.outcome ? (
                        <span className="block text-xs text-ink-muted">{humanise(w.outcome)}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-2">{w.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
