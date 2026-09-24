import { getOrganisation, hasPermission, ROLE_LABELS } from "@storevia/tenancy";
import { buttonClasses, Card, CardBody, CardHeader } from "@storevia/ui";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/app-shell";
import { orgPath } from "@/lib/ids";
import { organisationContextOr404 } from "@/lib/tenant";
import { LeaveOrganisationForm, OrganisationNameForm } from "./settings-forms";

export const metadata: Metadata = { title: "Organisation settings" };

export default async function OrganisationSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}/settings`);
  const organisation = await getOrganisation(ctx);
  return (
    <>
      <PageHeader
        title="Organisation settings"
        description={`Your role: ${ROLE_LABELS[ctx.role]}`}
      />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <OrganisationNameForm
              orgId={orgId}
              name={organisation.name}
              canEdit={hasPermission(ctx, "organisation.update")}
            />
          </CardBody>
        </Card>
        {hasPermission(ctx, "billing.read") ? (
          <Card>
            <CardHeader title="Billing" description="Your plan, its limits and your usage." />
            <CardBody>
              <Link
                href={orgPath(ctx.organisationId, "/billing")}
                className={buttonClasses("secondary", "sm")}
              >
                View plan and usage
              </Link>
            </CardBody>
          </Card>
        ) : null}
        {ctx.role !== "OWNER" ? (
          <Card>
            <CardHeader
              title="Leave organisation"
              description="You'll lose access to all of its stores."
            />
            <CardBody>
              <LeaveOrganisationForm orgId={orgId} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
