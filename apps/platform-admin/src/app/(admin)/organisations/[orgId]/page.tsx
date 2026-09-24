import {
  getOrganisationBillingDetail,
  STATUS_LABELS,
  type AdminOverride,
  type SubscriptionStatus,
} from "@storevia/billing";
import { isEntitling, type EntitlementValue } from "@storevia/entitlements";
import { hasPlatformPermission } from "@storevia/tenancy/platform";
import { toTypeId } from "@storevia/types";
import { Alert, Badge, Card, CardBody, CardHeader } from "@storevia/ui";
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

function describe(value: EntitlementValue): string {
  switch (value.kind) {
    case "BOOLEAN":
      return value.enabled ? "Enabled" : "Disabled";
    case "LIMIT":
      return value.limit === 0n ? "Not included (0)" : formatLimit(value.limit);
    case "UNLIMITED":
      return "Unlimited";
    case "CONFIGURATION":
      return value.enabled ? JSON.stringify(value.config) : "Disabled";
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
            {detail.usage.map((line) => {
              const pct =
                line.limit === "unlimited" || line.limit === 0n
                  ? 0
                  : Math.min(100, Number((line.usage * 100n) / line.limit));
              return (
                <div key={line.key} data-testid={`usage-${line.key}`}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{line.name}</span>
                    <span>
                      {line.usage.toString()} of {formatLimit(line.limit)}{" "}
                      {line.overLimit ? <Badge tone="danger">Over limit</Badge> : null}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-subtle" aria-hidden="true">
                    <div
                      className={`h-2 rounded-full ${line.overLimit ? "bg-danger-600" : "bg-brand-600"}`}
                      style={{
                        width: `${String(line.limit === "unlimited" ? 0 : line.overLimit ? 100 : pct)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {canManage ? <ReconcileButton action={bind(reconcileUsageAction)} /> : null}
          </CardBody>
        </Card>
      </div>

      <Card data-testid="entitlements-card">
        <CardHeader
          title="Effective entitlements"
          description="Resolved now: override → plan of an entitling subscription → system default."
        />
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Feature</th>
                <th className="px-5 py-2.5 font-medium">Value</th>
                <th className="px-5 py-2.5 font-medium">From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {detail.entitlements.entitlements.map((e) => (
                <tr key={e.key} data-testid={`entitlement-${e.key}`}>
                  <td className="px-5 py-2">
                    {e.name} <span className="text-xs text-ink-faint">{e.key}</span>
                  </td>
                  <td className="px-5 py-2">{describe(e.value)}</td>
                  <td className="px-5 py-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
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
        <CardBody className="overflow-x-auto p-0">
          {detail.events.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-muted">No subscription events yet.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-5 py-2.5 font-medium">Event</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Plan</th>
                  <th className="px-5 py-2.5 font-medium">By</th>
                  <th className="px-5 py-2.5 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detail.events.map((e) => (
                  <tr key={e.id} data-testid="history-row" className="align-top">
                    <td className="whitespace-nowrap px-5 py-2 text-ink-muted">
                      {formatDateTime(e.occurredAt)}
                    </td>
                    <td className="px-5 py-2">
                      <span className="font-medium">{humanise(e.type)}</span>
                      <span className="block text-xs text-ink-muted">
                        {SOURCE_LABELS[e.source] ?? e.source}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2">
                      {e.fromStatus ? `${humanise(e.fromStatus)} → ` : ""}
                      {e.toStatus ? humanise(e.toStatus) : ""}
                    </td>
                    <td className="px-5 py-2">
                      {e.fromPlanName && e.fromPlanName !== e.toPlanName
                        ? `${e.fromPlanName} → `
                        : ""}
                      {e.toPlanName}
                    </td>
                    <td className="px-5 py-2">
                      {e.actorType === "SYSTEM" ? "System" : (e.actorName ?? "Staff")}
                    </td>
                    <td className="px-5 py-2">
                      {e.reason}
                      {e.note ? (
                        <span className="block text-xs text-ink-muted">Note: {e.note}</span>
                      ) : null}
                      {e.providerEventId ? (
                        <code className="block font-mono text-[11px] text-ink-faint">
                          {e.providerEventId}
                        </code>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
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
