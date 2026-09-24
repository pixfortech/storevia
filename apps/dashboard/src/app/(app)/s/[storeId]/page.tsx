import {
  getOrganisationBilling,
  getStore,
  grantedFeatures,
  hasPermission,
  ROLE_LABELS,
} from "@storevia/tenancy";
import { BUSINESS_TYPE_DEFINITIONS, STORE_AREAS } from "@storevia/tenancy/business-types";
import { Alert, Badge, Card, CardBody, CardHeader, GlyphTile, ICON_STROKE } from "@storevia/ui";
import { ArrowRight, Check, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_ICONS } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/app-shell";
import { UsageMeters } from "@/components/usage-meters";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";
import { orgPath, storePath } from "@/lib/ids";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Home" };

function Step({
  done,
  title,
  description,
  href,
  action,
}: {
  done?: boolean;
  title: string;
  description: ReactNode;
  href?: string | undefined;
  action?: string;
}) {
  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className={
          done
            ? "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
            : "mt-0.5 size-6 shrink-0 rounded-full border-[1.5px] border-dashed border-line-strong"
        }
      >
        {done ? <Check strokeWidth={2.5} className="size-3.5" /> : null}
      </span>
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            {title}
            {done ? <span className="sr-only"> (done)</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
        {href && action ? (
          <Link
            href={href}
            className="-ml-3 mt-1 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control px-3 text-sm font-medium text-brand-700 hover:bg-brand-50 sm:ml-0 sm:mt-0 sm:h-9"
          >
            {action}
            <ArrowRight aria-hidden="true" strokeWidth={ICON_STROKE} className="size-4" />
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default async function StoreHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeId } = await params;
  const welcome = (await searchParams)["welcome"] === "1";
  const ctx = await storeContextOr404(storeId, `/s/${storeId}`);
  const canSeeBilling = hasPermission(ctx, "billing.read");
  const [store, granted, billing] = await Promise.all([
    getStore(ctx),
    grantedFeatures(ctx),
    canSeeBilling ? getOrganisationBilling(ctx) : null,
  ]);
  const definition = BUSINESS_TYPE_DEFINITIONS[store.businessType];
  // The business type decides emphasis; permissions still decide visibility.
  const focus = definition.homeFocus
    .map((key) => STORE_AREAS[key])
    .filter((area) => ctx.permissions.has(area.permission));
  const presets = definition.rolePresets.filter((p) => p.role !== "ADMIN" && p.role !== "VIEWER");

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <GlyphTile name={BUSINESS_TYPE_GLYPH[store.businessType]} size="sm" />
            {definition.label}
          </span>
        }
        title={store.name}
        description={`You're signed in as ${ROLE_LABELS[ctx.role]}.`}
      />
      {welcome ? (
        <Alert tone="success" title="Your store is ready" className="mb-6">
          It isn't visible to visitors yet: the storefront and site builder arrive in upcoming
          milestones.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Get set up" description="The steps you can take today." />
            <CardBody>
              <ol className="divide-y divide-line">
                <Step
                  done
                  title="Create your store"
                  description={`${store.name} is set up as ${definition.label.toLowerCase()}.`}
                />
                <Step
                  title="Check your store details"
                  description="Name, language, time zone and contact emails."
                  href={storePath(ctx.storeId, "/settings")}
                  action={hasPermission(ctx, "store.update") ? "Review" : "View"}
                />
                {hasPermission(ctx, "member.manage") ? (
                  <Step
                    title="Invite your team"
                    description={
                      presets.length > 0
                        ? `Suggested for ${definition.label.toLowerCase()}: ${presets
                            .slice(0, 3)
                            .map((p) => p.label.toLowerCase())
                            .join(", ")}.`
                        : "Give teammates the access they need."
                    }
                    href={orgPath(ctx.organisationId, "/members#invite")}
                    action="Invite"
                  />
                ) : null}
                {hasPermission(ctx, "store.update") ? (
                  <Step
                    title="Confirm what you're building"
                    description="Your business type shapes navigation and suggestions. Change it any time."
                    href={storePath(ctx.storeId, "/settings#business-type")}
                    action="Change"
                  />
                ) : null}
              </ol>
            </CardBody>
          </Card>

          {focus.length > 0 ? (
            <section aria-labelledby="focus-heading">
              <div className="mb-3">
                <h2 id="focus-heading" className="text-base font-semibold text-ink">
                  Built around your {definition.label.toLowerCase()}
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  What&apos;s coming first for your business type, and when.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-3">
                {focus.map((area) => {
                  const Icon = NAV_ICONS[area.key];
                  const locked = area.feature !== undefined && !granted.has(area.feature);
                  return (
                    <li key={area.key}>
                      <Link
                        href={storePath(ctx.storeId, area.segment)}
                        className="group flex h-full flex-col rounded-card border border-line bg-surface p-4 shadow-xs transition-colors hover:border-line-strong"
                      >
                        <span className="flex items-center justify-between">
                          <Icon
                            aria-hidden="true"
                            strokeWidth={ICON_STROKE}
                            className="size-5 text-ink-muted"
                          />
                          {locked ? (
                            <Lock
                              aria-label="Not included in your plan"
                              strokeWidth={ICON_STROKE}
                              className="size-3.5 text-ink-faint"
                            />
                          ) : null}
                        </span>
                        <span className="mt-3 font-medium text-ink">{area.label}</span>
                        <span className="mt-1 flex-1 text-sm text-ink-muted">
                          {area.description}
                        </span>
                        {area.availability ? (
                          <span className="mt-3 text-xs font-medium text-ink-faint">
                            Coming in {area.availability}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Store"
              actions={
                <Badge>
                  {store.status === "DRAFT" ? "Not launched" : store.status.toLowerCase()}
                </Badge>
              }
            />
            <CardBody>
              <dl className="space-y-3.5 text-sm">
                <div>
                  <dt className="text-ink-muted">Web address</dt>
                  <dd className="mt-0.5 break-all font-medium">{store.primaryHostname}</dd>
                  <dd className="text-xs text-ink-faint">
                    Goes live when storefronts launch (Milestone 4)
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <dt className="text-ink-muted">Currency</dt>
                    <dd className="mt-0.5 font-medium">{store.currency}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Language</dt>
                    <dd className="mt-0.5 font-medium">{store.locale}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-ink-muted">Time zone</dt>
                  <dd className="mt-0.5 font-medium">{store.timezone}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
          {billing ? (
            <Card>
              <CardHeader
                title={billing.subscription?.planName ?? "Free allowance"}
                description="Shared by every store in your organisation."
              />
              <CardBody>
                <UsageMeters usage={billing.usage} />
                <Link
                  href={orgPath(ctx.organisationId, "/billing")}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
                >
                  Plan and usage
                  <ArrowRight aria-hidden="true" strokeWidth={ICON_STROKE} className="size-4" />
                </Link>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
