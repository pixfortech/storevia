import { grantedFeatures, hasPermission } from "@storevia/tenancy";
import {
  BUSINESS_TYPE_DEFINITIONS,
  STORE_AREAS,
  type StoreArea,
} from "@storevia/tenancy/business-types";
import { Alert, Card, EmptyState, ICON_STROKE } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NAV_ICONS } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/app-shell";
import { orgPath } from "@/lib/ids";
import { storeContextOr404 } from "@/lib/tenant";

// Honest placeholders for store areas delivered in later milestones. They
// render no controls, so nothing looks functional that isn't. Every area is
// reachable whatever the business type (a type only changes emphasis), but
// each still requires its own permission.

function upcomingArea(segment: string): StoreArea | undefined {
  return Object.values(STORE_AREAS).find(
    (area) => area.availability !== undefined && area.segment === `/${segment}`,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area } = await params;
  return { title: upcomingArea(area)?.label ?? "Not found" };
}

export default async function AreaPlaceholderPage({
  params,
}: {
  params: Promise<{ storeId: string; area: string }>;
}) {
  const { storeId, area: segment } = await params;
  const area = upcomingArea(segment);
  if (!area) notFound();
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/${segment}`);
  if (!hasPermission(ctx, area.permission)) {
    return (
      <>
        <PageHeader title={area.label} />
        <Alert tone="warning" title="You don't have access to this area">
          Your role doesn't include {area.label.toLowerCase()}. Ask an owner or admin if you need
          it.
        </Alert>
      </>
    );
  }
  const granted = await grantedFeatures(ctx);
  const locked = area.feature !== undefined && !granted.has(area.feature);
  const inNavigation = BUSINESS_TYPE_DEFINITIONS[ctx.storeBusinessType].navigation.includes(
    area.key,
  );
  const Icon = NAV_ICONS[area.key];
  return (
    <>
      <PageHeader title={area.label} />
      <div className="max-w-3xl space-y-4">
        <Card>
          <EmptyState
            icon={<Icon aria-hidden="true" strokeWidth={ICON_STROKE} className="size-6" />}
            title={`${area.label} is coming in ${area.availability ?? "a later release"}`}
            description={area.description}
          />
        </Card>
        {locked ? (
          <Alert tone="info" title="Not included in your current plan">
            When {area.label.toLowerCase()} ships, it will need a plan that includes it.{" "}
            {hasPermission(ctx, "billing.read") ? (
              <Link
                href={orgPath(ctx.organisationId, "/billing")}
                className="font-medium underline"
              >
                See what your plan includes
              </Link>
            ) : (
              "Your organisation's owner can see what the plan includes."
            )}
          </Alert>
        ) : null}
        {!inNavigation ? (
          <p className="text-sm text-ink-muted">
            {area.label} isn&apos;t in the navigation for{" "}
            {BUSINESS_TYPE_DEFINITIONS[ctx.storeBusinessType].label.toLowerCase()} stores, but it
            stays available here.
          </p>
        ) : null}
      </div>
    </>
  );
}
