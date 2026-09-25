import { getAllowance, getOrganisation, hasPermission } from "@storevia/tenancy";
import { buttonClasses, Icon } from "@storevia/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { orgPath } from "@/lib/ids";
import { defaultsForCountry } from "@/lib/options";
import { storefrontDomainLabel } from "@/lib/storefront";
import { organisationContextOr404 } from "@/lib/tenant";
import { CreateStoreForm } from "./create-store-form";

export const metadata: Metadata = { title: "Create store" };

export default async function NewStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgId } = await params;
  const onboarding = (await searchParams)["onboarding"] === "1";
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}/stores/new`);
  if (!hasPermission(ctx, "store.create")) {
    return (
      <>
        <PageHeader eyebrow={ctx.organisationName} title="Create store" />
        <AccessNotice title="You can't create stores">
          Only owners and admins can create stores in {ctx.organisationName}.
        </AccessNotice>
      </>
    );
  }
  const allowance = await getAllowance(ctx, "store_count");
  if (allowance.limit !== "unlimited" && allowance.usage >= allowance.limit) {
    // Informational: createStore enforces the limit atomically on the server.
    return (
      <>
        <PageHeader eyebrow={ctx.organisationName} title="Create store" />
        <AccessNotice
          title="Your plan's store limit has been reached"
          action={
            <Link
              href={orgPath(ctx.organisationId, "/billing")}
              className={buttonClasses("secondary")}
            >
              View plan and usage
              <Icon icon={ArrowRight} size="sm" />
            </Link>
          }
        >
          {ctx.organisationName} has {allowance.usage.toString()} of {allowance.limit.toString()}{" "}
          {allowance.limit === 1n ? "store" : "stores"} allowed by its plan. Archive a store, or
          contact Storevia to change your plan.
        </AccessNotice>
      </>
    );
  }
  const organisation = await getOrganisation(ctx);
  return (
    <>
      <PageHeader
        eyebrow={onboarding ? "Step 2 of 2" : ctx.organisationName}
        title={onboarding ? "Create your first store" : "Create store"}
        description={
          onboarding
            ? "Tell us what you're building. You can change everything except the address and currency later."
            : "Each store has its own address, navigation and team access. It shares your organisation's plan."
        }
      />
      <CreateStoreForm
        orgId={orgId}
        rootDomain={storefrontDomainLabel()}
        defaults={defaultsForCountry(organisation.country)}
      />
    </>
  );
}
