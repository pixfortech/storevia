import { getOrganisation, hasPermission, ROLE_LABELS } from "@storevia/tenancy";
import { buttonClasses, CardBody, DescriptionList, Icon } from "@storevia/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  DangerRow,
  DangerZone,
  SettingsLayout,
  SettingsSection,
  type SettingsSectionLink,
} from "@/components/areas/settings";
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
  const canReadBilling = hasPermission(ctx, "billing.read");
  const owner = ctx.role === "OWNER";
  const sections: SettingsSectionLink[] = [
    { id: "details", label: "Details" },
    { id: "access", label: "Your access" },
    ...(canReadBilling ? [{ id: "billing", label: "Plan and billing" }] : []),
    { id: "danger-zone", label: "Danger zone", danger: true },
  ];
  return (
    <>
      <PageHeader
        eyebrow={ctx.organisationName}
        title="Organisation settings"
        description="Details that apply to every store in your organisation."
      />
      <SettingsLayout sections={sections}>
        <SettingsSection
          id="details"
          title="Details"
          description="How your organisation appears to your team and to Storevia."
        >
          <OrganisationNameForm
            orgId={orgId}
            name={organisation.name}
            canEdit={hasPermission(ctx, "organisation.update")}
          />
        </SettingsSection>

        <SettingsSection
          id="access"
          title="Your access"
          description="What you can do here comes from your role."
        >
          <CardBody>
            <DescriptionList
              items={[
                { term: "Role", detail: ROLE_LABELS[ctx.role] },
                {
                  term: "Stores",
                  detail: ctx.allStores ? "All stores" : "Only the stores you've been given",
                },
              ]}
            />
          </CardBody>
        </SettingsSection>

        {canReadBilling ? (
          <SettingsSection
            id="billing"
            title="Plan and billing"
            description="Your plan, its limits and your usage are on the billing page."
          >
            <CardBody>
              <Link
                href={orgPath(ctx.organisationId, "/billing")}
                className={buttonClasses("secondary", "sm")}
              >
                View plan and usage
                <Icon icon={ArrowRight} size="sm" />
              </Link>
            </CardBody>
          </SettingsSection>
        ) : null}

        <DangerZone description="Actions here change who can reach this organisation.">
          <DangerRow
            title="Leave organisation"
            description={
              owner ? (
                <>
                  You&apos;re the owner, so you can&apos;t leave yet. Transfer ownership to an admin
                  on the{" "}
                  <Link
                    href={orgPath(ctx.organisationId, "/members")}
                    className="font-medium text-brand-700 underline-offset-2 hover:underline"
                  >
                    Members
                  </Link>{" "}
                  page first.
                </>
              ) : (
                "You'll lose access to all of its stores, and you'll need a new invitation to come back."
              )
            }
            action={owner ? null : <LeaveOrganisationForm orgId={orgId} />}
          />
        </DangerZone>
      </SettingsLayout>
    </>
  );
}
