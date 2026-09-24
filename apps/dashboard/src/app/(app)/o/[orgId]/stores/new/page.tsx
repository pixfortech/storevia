import { getOrganisation, hasPermission } from "@storevia/tenancy";
import { Alert, Card, CardBody } from "@storevia/ui";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/app-shell";
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
