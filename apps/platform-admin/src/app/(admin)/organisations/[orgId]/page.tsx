import {
  getCatalogueDiagnostics,
  getOrganisationBillingDetail,
  STATUS_LABELS,
  type AdminOverride,
  type SubscriptionStatus,
} from "@storevia/billing";
import { isEntitling, type EntitlementValue, type FeatureKey } from "@storevia/entitlements";
import { formatBytes, formatEntitlement, isByteFeature } from "@storevia/entitlements/format";
import { hasPlatformPermission } from "@storevia/tenancy/platform";
import { toTypeId } from "@storevia/types";
import { buttonClasses } from "@storevia/ui/button";
import { DataList, DescriptionList, Stat, UsageMeter } from "@storevia/ui/data";
import {
  Alert,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  PageHeader,
  SectionHeader,
} from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminBreadcrumb } from "@/components/admin-breadcrumb";
import { RiskSummary } from "@/components/risk-summary";
import { requireStaff } from "@/lib/auth";
import {
  dateInputValue,
  formatDate,
  formatDateTime,
  humanise,
  INTERVAL_LABELS,
  ORGANISATION_STATUS_TONES,
  SOURCE_LABELS,
  STATUS_TONES,
} from "@/lib/format";
import { stepUpHref } from "@/lib/navigation";
import { riskItems } from "@/lib/risk";
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

const ORIGIN = {
  OVERRIDE: { label: "Override", tone: "warning" },
  PLAN: { label: "Plan", tone: "brand" },
  DEFAULT: { label: "System default", tone: "neutral" },
} as const;

/** A titled group of cards; the id is the "On this page" anchor. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32 space-y-4">
      <SectionHeader
        title={<span id={`${id}-title`}>{title}</span>}
        {...(description ? { description } : {})}
      />
      {children}
    </section>
  );
}

export default async function OrganisationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireStaff(`/organisations/${orgId}`);
  const [detail, catalogue] = await Promise.all([
    getOrganisationBillingDetail(ctx, orgId),
    getCatalogueDiagnostics(ctx, orgId),
  ]);
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
  const publicId = toTypeId("organisation", org.id);
  const origins = detail.entitlements.entitlements.reduce<Record<string, number>>((acc, e) => {
    acc[e.origin] = (acc[e.origin] ?? 0) + 1;
    return acc;
  }, {});

  const bind = <A extends unknown[], R>(fn: (orgId: string, ...args: A) => R) =>
    fn.bind(null, orgId);

  const sections = [
    { id: "billing", label: "Subscription and usage" },
    { id: "catalogue", label: "Catalogue" },
    { id: "entitlements", label: "Entitlements" },
    ...(canSimulate ? [{ id: "simulator", label: "Billing simulator" }] : []),
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <PageHeader
          breadcrumb={
            <AdminBreadcrumb
              items={[{ label: "Organisations", href: "/organisations" }, { label: org.name }]}
            />
          }
          title={
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={org.name} shape="square" size="lg" />
              <span className="min-w-0 break-words">{org.name}</span>
            </span>
          }
          meta={
            // The organisation's lifecycle, not its billing: named as such and
            // kept neutral while active, so it never reads as "all good" beside
            // a past-due subscription. Problems keep their colour.
            <Badge
              tone={
                org.status === "ACTIVE"
                  ? "neutral"
                  : (ORGANISATION_STATUS_TONES[org.status] ?? "neutral")
              }
              dot
            >
              Organisation {humanise(org.status).toLowerCase()}
            </Badge>
          }
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
              <span>Owner {org.ownerEmail ?? "not set"}</span>
              <span aria-hidden="true" className="hidden text-line-strong sm:inline">
                ·
              </span>
              <code className="font-mono text-caption text-ink-faint">{publicId}</code>
            </span>
          }
        />

        {/* Key facts: hairlines between cells (the grid gap shows the line colour). */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3 lg:grid-cols-5 [&>div]:bg-surface [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-6">
          <Stat label="Plan" value={sub?.planName ?? "System default"} />
          <Stat
            label="Subscription"
            value={
              status ? (
                <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
              ) : (
                <span className="text-ink-muted">None</span>
              )
            }
          />
          <Stat label="Stores" value={org.storeCount} />
          <Stat label="Team members" value={org.memberCount} />
          <Stat
            label="Created"
            value={formatDate(org.createdAt)}
            className="col-span-2 lg:col-span-1"
          />
        </dl>

        <RiskSummary
          items={riskItems({
            organisationStatus: org.status,
            subscription: sub,
            entitling,
            usage: detail.usage,
            overrides: detail.overrides,
            now,
          })}
        />

        {stepUpNeeded ? (
          <Alert
            tone="info"
            title="Password confirmation needed"
            actions={
              <Link
                href={stepUpHref(`/organisations/${orgId}`)}
                className={buttonClasses("secondary", "sm", "pointer-coarse:h-11")}
              >
                Confirm your password
              </Link>
            }
          >
            Plan, subscription and override changes need a password confirmation in the last 10
            minutes.
          </Alert>
        ) : null}

        <nav aria-label="On this page" className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-faint">On this page</span>
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex h-8 items-center rounded-pill border border-line px-3 text-caption font-medium text-ink-muted transition-colors duration-(--duration-fast) hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:h-11"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      <Section
        id="billing"
        title="Subscription and usage"
        description="The live subscription decides the plan. Dates are in UTC."
      >
        <div className="grid gap-4 lg:grid-cols-5 lg:items-start lg:gap-6">
          <Card data-testid="subscription-card" className="lg:col-span-3">
            <CardHeader
              title="Subscription"
              description={sub ? undefined : "No live subscription. System defaults apply."}
              actions={
                sub && status ? (
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={STATUS_TONES[status]} data-testid="subscription-status">
                      {STATUS_LABELS[status]}
                    </Badge>
                    <Badge variant="outline" data-testid="subscription-source">
                      {SOURCE_LABELS[sub.source] ?? sub.source}
                    </Badge>
                  </span>
                ) : null
              }
            />
            <CardBody className="space-y-5">
              {sub ? (
                <>
                  <DescriptionList
                    items={[
                      {
                        term: "Plan",
                        detail: (
                          <span data-testid="subscription-plan" className="font-medium">
                            {sub.planName}
                          </span>
                        ),
                      },
                      {
                        term: "Grants entitlements now",
                        detail: entitling ? "Yes" : "No: past its end date",
                      },
                      {
                        term: "Billing interval",
                        detail: sub.billingInterval
                          ? INTERVAL_LABELS[sub.billingInterval]
                          : "Not billed on a cycle",
                      },
                      { term: "Started", detail: formatDateTime(sub.startedAt) },
                      ...(sub.trialEndsAt
                        ? [{ term: "Trial ends", detail: formatDateTime(sub.trialEndsAt) }]
                        : []),
                      ...(sub.currentPeriodEnd
                        ? [
                            {
                              term: "Current period ends",
                              detail: formatDateTime(sub.currentPeriodEnd),
                            },
                          ]
                        : []),
                      ...(sub.graceEndsAt
                        ? [{ term: "Grace period ends", detail: formatDateTime(sub.graceEndsAt) }]
                        : []),
                      {
                        term: sub.status === "CANCELLED" ? "Access ends" : "Expiry",
                        detail: sub.expiresAt ? formatDateTime(sub.expiresAt) : "No expiry",
                      },
                      ...(sub.providerSubscriptionId
                        ? [
                            {
                              term: "Provider reference",
                              detail: (
                                <code className="font-mono text-caption">
                                  {sub.providerSubscriptionId}
                                </code>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
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
              {!canManage ? (
                <p className="text-body-sm text-ink-muted">
                  Your platform role can view this subscription but not change it.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card data-testid="usage-card" className="lg:col-span-2">
            <CardHeader
              title="Usage"
              description="Over a limit, existing resources keep working and new ones are blocked."
            />
            <CardBody className="space-y-6">
              {detail.usage.map((line) => (
                <UsageMeter
                  key={line.key}
                  data-testid={`usage-${line.key}`}
                  label={line.name}
                  used={Number(line.usage)}
                  limit={line.limit === "unlimited" ? "unlimited" : Number(line.limit)}
                  {...(isByteFeature(line.key)
                    ? { format: (value: number) => formatBytes(BigInt(Math.round(value))) }
                    : {})}
                />
              ))}
            </CardBody>
            {canManage ? (
              <CardFooter className="justify-between">
                <span className="text-caption text-ink-faint">
                  Counters drifted? Recount from the database.
                </span>
                <ReconcileButton action={bind(reconcileUsageAction)} />
              </CardFooter>
            ) : null}
          </Card>
        </div>
      </Section>

      <Section
        id="catalogue"
        title="Catalogue"
        description="Counts only, for diagnosing support requests. Staff never see catalogue content."
      >
        <Card data-testid="catalogue-card">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-card bg-line sm:grid-cols-3 lg:grid-cols-6 [&>div]:bg-surface [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-6">
            <Stat label="Active products" value={catalogue.products.active} />
            <Stat label="Draft products" value={catalogue.products.draft} />
            <Stat label="Archived products" value={catalogue.products.archived} />
            <Stat label="Variants" value={catalogue.variants} />
            <Stat label="Locations" value={catalogue.locations} />
            <Stat label="Tracked items" value={catalogue.trackedItems} />
          </dl>
          <CardBody className="space-y-5 border-t border-line">
            <DescriptionList
              items={[
                {
                  term: "Media",
                  detail: `${String(catalogue.media.ready)} ready, ${formatBytes(catalogue.media.bytes)}${
                    catalogue.media.inProgress > 0
                      ? `; ${String(catalogue.media.inProgress)} uploading or processing`
                      : ""
                  }${catalogue.media.rejected > 0 ? `; ${String(catalogue.media.rejected)} rejected` : ""}`,
                },
                {
                  term: "Stock checks",
                  detail:
                    catalogue.overReservedLevels + catalogue.negativeLevels === 0 ? (
                      "No anomalies"
                    ) : (
                      <span className="text-warning-700">
                        {catalogue.overReservedLevels > 0
                          ? `${String(catalogue.overReservedLevels)} levels with more reserved than on hand. `
                          : ""}
                        {catalogue.negativeLevels > 0
                          ? `${String(catalogue.negativeLevels)} levels below zero (overselling allowed).`
                          : ""}
                      </span>
                    ),
                },
                ...(catalogue.stores.length > 0
                  ? [
                      {
                        term: "Products by store",
                        detail: (
                          <ul className="space-y-1">
                            {catalogue.stores.map((s) => (
                              <li key={s.storeId} className="flex flex-wrap gap-x-2">
                                <span className="font-medium">{s.name}</span>
                                <span className="text-ink-muted tabular-nums">{s.products}</span>
                                <code className="font-mono text-caption text-ink-faint">
                                  {s.storeId}
                                </code>
                              </li>
                            ))}
                          </ul>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </CardBody>
        </Card>
      </Section>

      <Section
        id="entitlements"
        title="Entitlements"
        description="What this organisation can use right now, and the exceptions staff have made."
      >
        <Card data-testid="entitlements-card">
          <CardHeader
            title="Effective entitlements"
            description="Resolved now: override → plan of an entitling subscription → system default."
            actions={
              <span className="flex flex-wrap gap-1.5">
                {(["OVERRIDE", "PLAN", "DEFAULT"] as const).map((origin) =>
                  origins[origin] ? (
                    <Badge key={origin} tone={ORIGIN[origin].tone} size="sm">
                      {origins[origin]} from {ORIGIN[origin].label.toLowerCase()}
                    </Badge>
                  ) : null,
                )}
              </span>
            }
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
                    <span className="font-medium">{e.name}</span>
                    <code className="block font-mono text-[11px] text-ink-faint">{e.key}</code>
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
                      <span className={value.label === "Not included" ? "text-ink-muted" : ""}>
                        {value.label}
                      </span>
                      {value.raw ? (
                        <code className="block font-mono text-[11px] text-ink-faint">
                          {value.raw}
                        </code>
                      ) : null}
                    </>
                  );
                },
              },
              {
                key: "origin",
                header: "From",
                cell: (e) => {
                  const origin = ORIGIN[e.origin];
                  return (
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={origin.tone}>{origin.label}</Badge>
                      {e.overrideExpiresAt ? (
                        <span className="text-caption text-ink-muted">
                          until {formatDate(e.overrideExpiresAt)}
                        </span>
                      ) : null}
                    </span>
                  );
                },
              },
            ]}
          />
        </Card>

        <Card data-testid="overrides-card">
          <OverrideManager
            overrides={detail.overrides.map((o) => overrideRow(o, now))}
            features={detail.features}
            canManage={canOverride}
            actions={{ set: bind(setOverrideAction), remove: bind(removeOverrideAction) }}
          />
        </Card>
      </Section>

      {canSimulate ? (
        <Section
          id="simulator"
          title="Billing simulator"
          description="Test environments only. Never available in production."
        >
          <Card data-testid="simulation-card">
            <CardHeader
              title="Mock billing simulator"
              description={`Environment: ${detail.enabledProviders.join(", ")} provider enabled`}
              actions={
                <Badge tone="warning" dot>
                  Test billing
                </Badge>
              }
            />
            <CardBody>
              <SimulationPanel plans={assignable} action={bind(simulateAction)} />
            </CardBody>
          </Card>
        </Section>
      ) : null}

      <Section
        id="history"
        title="History"
        description="Every subscription change and billing delivery, newest first. Staff changes are also written to the audit log, which can't be browsed here yet."
      >
        <Card data-testid="history-card">
          <CardHeader
            title="Subscription history"
            description="Every change, whatever its source."
          />
          <DataList
            caption="Subscription history"
            rows={detail.events}
            rowKey={(e) => e.id}
            rowTestId="history-row"
            empty={
              <p className="px-6 py-5 text-body-sm text-ink-muted">No subscription events yet.</p>
            }
            columns={[
              {
                key: "when",
                header: "When",
                className: "whitespace-nowrap text-ink-muted tabular-nums",
                cell: (e) => formatDateTime(e.occurredAt),
              },
              {
                key: "event",
                header: "Event",
                primary: true,
                cell: (e) => (
                  <>
                    <span className="font-medium">{humanise(e.type)}</span>
                    <span className="block text-caption text-ink-muted">
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
                    {e.fromPlanName && e.fromPlanName !== e.toPlanName
                      ? `${e.fromPlanName} → `
                      : ""}
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
                      <span className="block text-caption text-ink-muted">Note: {e.note}</span>
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
            <DataList
              caption="Billing webhook deliveries"
              rows={detail.webhookEvents}
              rowKey={(w) => w.providerEventId}
              rowTestId="webhook-row"
              columns={[
                {
                  key: "received",
                  header: "Received",
                  className: "whitespace-nowrap text-ink-muted tabular-nums",
                  cell: (w) => formatDateTime(w.receivedAt),
                },
                {
                  key: "event",
                  header: "Event",
                  primary: true,
                  cell: (w) => (
                    <>
                      <span className="font-medium">{humanise(w.type)}</span>
                      <code className="block font-mono text-[11px] text-ink-faint">
                        {w.providerEventId}
                      </code>
                    </>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (w) => (
                    <>
                      {humanise(w.status)}
                      {w.outcome ? (
                        <span className="block text-caption text-ink-muted">
                          {humanise(w.outcome)}
                        </span>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "attempts",
                  header: "Attempts",
                  align: "end",
                  cell: (w) => w.attempts,
                },
              ]}
            />
          </Card>
        ) : null}
      </Section>
    </div>
  );
}
