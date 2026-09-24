import { getOrganisation, hasPermission, ROLE_LABELS } from "@storevia/tenancy";
import { Card, CardBody, CardHeader } from "@storevia/ui";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/app-shell";
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
        <Card>
          <CardHeader title="Billing" description="Plans and invoices arrive with Milestone 2." />
          <CardBody>
            <p className="text-sm text-ink-muted">
              Billing isn't available yet. Nothing is charged during this phase.
            </p>
          </CardBody>
        </Card>
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
