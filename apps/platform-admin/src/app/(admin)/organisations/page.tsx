import {
  listOrganisationsForAdmin,
  STATUS_LABELS,
  type SubscriptionStatus,
} from "@storevia/billing";
import { toTypeId } from "@storevia/types";
import { Badge, Button, Card, DataList, EmptyState, Input } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatDate, SOURCE_LABELS, STATUS_TONES } from "@/lib/format";

export const metadata: Metadata = { title: "Organisations" };

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireStaff("/organisations");
  const query = (await searchParams)["q"] ?? "";
  const organisations = await listOrganisationsForAdmin(ctx, { query });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organisations</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Merchant organisations and their subscriptions.
          </p>
        </div>
        <form role="search" className="flex w-full gap-2 sm:w-auto">
          <label htmlFor="q" className="sr-only">
            Search organisations
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Search by name"
            className="sm:w-64"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>
      <Card>
        <DataList
          caption="Organisations"
          rows={organisations}
          rowKey={(org) => org.id}
          rowTestId="organisation-row"
          empty={
            <EmptyState
              title="No organisations found"
              description={query ? "Try another search." : undefined}
            />
          }
          columns={[
            {
              key: "name",
              header: "Organisation",
              primary: true,
              cell: (org) => (
                <>
                  <Link
                    href={`/organisations/${toTypeId("organisation", org.id)}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {org.name}
                  </Link>
                  {org.status !== "ACTIVE" ? (
                    <Badge tone="danger" className="ml-2">
                      {org.status.toLowerCase()}
                    </Badge>
                  ) : null}
                </>
              ),
            },
            {
              key: "plan",
              header: "Plan",
              cell: (org) => org.planName ?? <span className="text-ink-muted">System default</span>,
            },
            {
              key: "subscription",
              header: "Subscription",
              cell: (org) => {
                const status = org.subscriptionStatus as SubscriptionStatus | null;
                return status ? (
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
                    <Badge>{SOURCE_LABELS[org.source ?? ""] ?? org.source}</Badge>
                  </span>
                ) : (
                  <span className="text-ink-muted">None</span>
                );
              },
            },
            {
              key: "created",
              header: "Created",
              className: "text-ink-muted",
              cell: (org) => formatDate(org.createdAt),
            },
          ]}
        />
      </Card>
    </div>
  );
}
