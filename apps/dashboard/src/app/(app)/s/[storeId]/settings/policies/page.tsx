import { listPolicies, policyDefinition } from "@storevia/commerce";
import { getStore, hasPermission, launchReadiness } from "@storevia/tenancy";
import { buttonClasses } from "@storevia/ui/button";
import { Alert, Badge, Card, CardHeader } from "@storevia/ui/surfaces";
import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { PageHeader } from "@/components/shell/app-shell";
import { formatLongDate } from "@/lib/areas/dates";
import { storeLaunchChecks } from "@/lib/launch-readiness";
import { POLICY_STATUS, policyEditorPath, policyRequirementLabel } from "@/lib/policies";
import { settingsTabs } from "@/lib/settings-tabs";
import { storeContextOr404 } from "@/lib/tenant";

// Store policies (final pass, Phase 2A): every kind, whether it's written
// and published, and whether the store needs it to go live. The merchant
// writes each one; Storevia offers section headings, never the wording.

export const metadata: Metadata = { title: "Store policies" };

export default async function PoliciesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/settings/policies`);
  const [policies, checks, store] = await Promise.all([
    listPolicies(ctx),
    launchReadiness(ctx, storeLaunchChecks(ctx.storeId)),
    getStore(ctx),
  ]);
  const archived = ctx.storeStatus === "ARCHIVED";
  const canEdit = hasPermission(ctx, "store.update") && !archived;
  const launch = checks.find((c) => c.key === "policies");
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Store policies"
        description="The policies shoppers read on your store, linked from its footer and checkout."
      />
      {hasPermission(ctx, "settings.manage") ? (
        <LinkTabs
          label="Settings sections"
          className="mb-6 lg:mb-8"
          tabs={settingsTabs(ctx.storeId, "policies")}
        />
      ) : null}
      <div className="max-w-3xl space-y-6">
        {!canEdit ? (
          <Alert tone="neutral" icon={Lock}>
            {archived
              ? "This store is archived, so its policies can't be changed."
              : "You can view these policies but not change them."}
          </Alert>
        ) : null}
        {launch ? (
          <Alert
            tone={launch.ok ? "success" : "warning"}
            title={launch.ok ? "Ready to go live" : "Needed before you go live"}
            data-testid="policies-readiness"
          >
            {launch.detail}
          </Alert>
        ) : null}
        <Card>
          <CardHeader
            title="Policies"
            description="You write each policy in your own words. Starter headings can help you structure one, but Storevia doesn't provide legal wording."
          />
          <ul className="divide-y divide-line">
            {policies.map((policy) => {
              const definition = policyDefinition(policy.kind);
              const status = POLICY_STATUS[policy.status];
              const href = policyEditorPath(storeId, definition.handle);
              return (
                <li
                  key={policy.kind}
                  data-testid="policy-row"
                  data-kind={definition.handle}
                  data-status={policy.status}
                  className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4 sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="text-body-sm font-semibold text-ink">
                        <Link href={href} className="hover:underline">
                          {policy.title}
                        </Link>
                      </h3>
                      <Badge variant="dot" tone={status.tone}>
                        {status.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-body-sm text-ink-muted">{definition.description}</p>
                    <p className="mt-1 text-caption text-ink-faint">
                      {policyRequirementLabel(definition)}
                      {policy.publishedAt
                        ? ` · Published ${formatLongDate(policy.publishedAt, store.timezone)}`
                        : ""}
                    </p>
                  </div>
                  <Link href={href} className={buttonClasses("secondary", "sm")}>
                    {canEdit ? (policy.status === "empty" ? "Write" : "Edit") : "View"}
                    <span className="sr-only"> {policy.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
