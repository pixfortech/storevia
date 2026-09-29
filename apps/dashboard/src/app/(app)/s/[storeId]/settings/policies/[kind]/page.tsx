import { getPolicy, policyByHandle, policyPath, policyStarter } from "@storevia/commerce";
import { getOnlineStore, getStore, hasPermission } from "@storevia/tenancy";
import { buttonClasses } from "@storevia/ui/button";
import { Alert, Badge } from "@storevia/ui/surfaces";
import { ArrowLeft, ExternalLink, Lock } from "lucide-react";
import type { JSONContent } from "@tiptap/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PolicyEditor } from "@/components/settings/policy-editor";
import { PageHeader } from "@/components/shell/app-shell";
import { formatLongDate } from "@/lib/areas/dates";
import { POLICY_STATUS, policyRequirementLabel } from "@/lib/policies";
import { settingsPath } from "@/lib/settings-tabs";
import { storeContextOr404 } from "@/lib/tenant";

// One store policy's editor (final pass, Phase 2A). The URL carries the
// policy's storefront handle (/settings/policies/refunds); anything else is
// a 404, as is another tenant's store.

interface Props {
  params: Promise<{ storeId: string; kind: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const definition = policyByHandle((await params).kind);
  return { title: definition?.defaultTitle ?? "Store policy" };
}

export default async function PolicyPage({ params }: Props) {
  const { storeId, kind: handle } = await params;
  const definition = policyByHandle(handle);
  if (!definition) notFound();
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/settings/policies/${handle}`);
  const [policy, online, store] = await Promise.all([
    getPolicy(ctx, definition.kind),
    getOnlineStore(ctx),
    getStore(ctx),
  ]);
  const archived = ctx.storeStatus === "ARCHIVED";
  const canEdit = hasPermission(ctx, "store.update") && !archived;
  const status = POLICY_STATUS[policy.status];
  const published = policy.status === "published" || policy.status === "changed";
  const live = online.status === "ACTIVE";
  const storeUrl =
    published && online.url ? new URL(policyPath(definition.kind), online.url).toString() : null;
  return (
    <>
      <PageHeader
        eyebrow={`${ctx.storeName} · Store policies`}
        title={definition.defaultTitle}
        description={definition.description}
        meta={
          <Badge variant="dot" tone={status.tone} data-testid="policy-status">
            {status.label}
          </Badge>
        }
        actions={
          <>
            <Link
              href={settingsPath(storeId, "/policies")}
              className={buttonClasses("secondary", "md")}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              All policies
            </Link>
            {storeUrl ? (
              <a
                href={storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("secondary", "md")}
              >
                View on your store
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </>
        }
        className="mb-6 lg:mb-8"
      />
      <div className="max-w-3xl space-y-6">
        {!canEdit ? (
          <Alert tone="neutral" icon={Lock}>
            {archived
              ? "This store is archived, so its policies can't be changed."
              : "You can read this policy but not change it."}
          </Alert>
        ) : null}
        <p className="text-body-sm text-ink-muted">
          {policyRequirementLabel(definition)}.
          {policy.publishedAt
            ? ` Published ${formatLongDate(policy.publishedAt, store.timezone)}.`
            : " Not published: shoppers don't see it yet."}
          {published && !live ? " Shoppers can read it once your store is live." : ""}
        </p>
        <PolicyEditor
          storeId={storeId}
          handle={definition.handle}
          title={policy.title}
          body={policy.body as JSONContent | null}
          starter={policyStarter(definition.kind) as unknown as JSONContent}
          revision={policy.revision}
          published={published}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
