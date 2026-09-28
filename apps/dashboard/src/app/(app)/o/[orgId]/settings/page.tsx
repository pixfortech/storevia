import {
  DELETION_COOLING_OFF_DAYS,
  getOrganisation,
  hasPermission,
  ROLE_LABELS,
} from "@storevia/tenancy";
import { Button, buttonClasses } from "@storevia/ui/button";
import { DescriptionList } from "@storevia/ui/data";
import { Icon } from "@storevia/ui/icons";
import { Alert, CardBody } from "@storevia/ui/surfaces";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
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
import {
  DeleteOrganisationForm,
  LeaveOrganisationForm,
  OrganisationNameForm,
} from "./settings-forms";

export const metadata: Metadata = { title: "Organisation settings" };

const EXPORT_PROBLEMS: Record<string, { title: string; body: ReactNode }> = {
  reauth: {
    title: "Confirm your password first",
    body: (
      <>
        The export contains your customers&apos; personal data.{" "}
        <Link href="/account/security#confirm" className="font-medium underline">
          Confirm your password
        </Link>
        , then export again.
      </>
    ),
  },
  limit: { title: "Too many exports", body: "Try again in an hour." },
  forbidden: { title: "Only the owner can export", body: "Ask the organisation's owner." },
};

export default async function OrganisationSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgId } = await params;
  const exportProblem = EXPORT_PROBLEMS[(await searchParams)["export"] ?? ""];
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}/settings`);
  const organisation = await getOrganisation(ctx);
  const canReadBilling = hasPermission(ctx, "billing.read");
  const owner = ctx.role === "OWNER";
  const sections: SettingsSectionLink[] = [
    { id: "details", label: "Details" },
    { id: "access", label: "Your access" },
    ...(canReadBilling ? [{ id: "billing", label: "Plan and billing" }] : []),
    ...(owner ? [{ id: "data", label: "Your data" }] : []),
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

        {owner ? (
          <SettingsSection
            id="data"
            title="Your data"
            description="Everything this organisation holds, as one JSON file: stores, products, customers, orders, payments, pages, themes, domains and messages."
          >
            <CardBody className="space-y-4">
              {exportProblem ? (
                <Alert tone="warning" title={exportProblem.title}>
                  {exportProblem.body}
                </Alert>
              ) : null}
              <p className="text-body-sm text-ink-muted">
                It includes your customers&apos; personal data, so it needs a recent password
                confirmation. Keep the file safe. Passwords, payment keys and other secrets are
                never included.
              </p>
              <form method="post" action={`/o/${orgId}/export`}>
                <Button type="submit" variant="secondary" size="sm">
                  Export all data
                </Button>
              </form>
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
          {hasPermission(ctx, "organisation.delete") ? (
            <DangerRow
              title="Delete organisation"
              description={`Closes every store now and deletes the organisation after ${String(DELETION_COOLING_OFF_DAYS)} days. Needs a recent password confirmation.`}
              action={
                <DeleteOrganisationForm
                  orgId={orgId}
                  name={organisation.name}
                  coolingOffDays={DELETION_COOLING_OFF_DAYS}
                />
              }
            />
          ) : null}
        </DangerZone>
      </SettingsLayout>
    </>
  );
}
