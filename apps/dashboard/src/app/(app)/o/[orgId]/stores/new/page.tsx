import { getAllowance, getOrganisation, hasPermission } from "@storevia/tenancy";
import { Alert, buttonClasses, Card, CardBody } from "@storevia/ui";
import Link from "next/link";
import type { Metadata } from "next";
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
        <PageHeader title="Create store" />
        <Alert tone="warning" title="You can't create stores">
          Only owners and admins can create stores in {ctx.organisationName}.
        </Alert>
      </>
    );
  }
  const allowance = await getAllowance(ctx, "store_count");
  if (allowance.limit !== "unlimited" && allowance.usage >= allowance.limit) {
    // Informational: createStore enforces the limit atomically on the server.
    return (
      <>
        <PageHeader title="Create store" />
        <Alert
          tone="warning"
          title="Your plan's store limit has been reached"
          className="max-w-2xl"
        >
          {ctx.organisationName} has {allowance.usage.toString()} of {allowance.limit.toString()}{" "}
          {allowance.limit === 1n ? "store" : "stores"} allowed by its plan. Archive a store, or
          contact Storevia to change your plan.
          <div className="mt-3">
            <Link
              href={orgPath(ctx.organisationId, "/billing")}
              className={buttonClasses("secondary", "sm")}
            >
              View plan and usage
            </Link>
          </div>
        </Alert>
      </>
    );
  }
  const organisation = await getOrganisation(ctx);
  return (
    <>
      <PageHeader
        title={onboarding ? "Create your first store" : "Create store"}
        description={
          onboarding
            ? "Step 2 of 2 · You can change everything except the address later."
            : undefined
        }
      />
      <Card className="max-w-2xl">
        <CardBody className="py-6">
          <CreateStoreForm
            orgId={orgId}
            rootDomain={storefrontDomainLabel()}
            defaults={defaultsForCountry(organisation.country)}
          />
        </CardBody>
      </Card>
    </>
  );
}
