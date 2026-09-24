import {
  listOrganisationsForAdmin,
  STATUS_LABELS,
  type SubscriptionStatus,
} from "@storevia/billing";
import { toTypeId } from "@storevia/types";
import { Badge, Button, Card, EmptyState, Input } from "@storevia/ui";
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
        {organisations.length === 0 ? (
          <EmptyState
            title="No organisations found"
            description={query ? "Try another search." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Organisation</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Subscription</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {organisations.map((org) => {
                  const status = org.subscriptionStatus as SubscriptionStatus | null;
                  return (
                    <tr key={org.id} data-testid="organisation-row">
                      <td className="px-5 py-3">
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
                      </td>
                      <td className="px-5 py-3">
                        {org.planName ?? <span className="text-ink-muted">System default</span>}
                      </td>
                      <td className="px-5 py-3">
                        {status ? (
                          <span className="flex flex-wrap gap-1.5">
                            <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
                            <Badge>{SOURCE_LABELS[org.source ?? ""] ?? org.source}</Badge>
                          </span>
                        ) : (
                          <span className="text-ink-muted">None</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-ink-muted">{formatDate(org.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
