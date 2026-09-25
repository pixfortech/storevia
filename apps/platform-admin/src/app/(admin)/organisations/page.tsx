import {
  listOrganisationsForAdmin,
  STATUS_LABELS,
  type SubscriptionStatus,
} from "@storevia/billing";
import { toTypeId } from "@storevia/types";
import { Button } from "@storevia/ui/button";
import { DataList } from "@storevia/ui/data";
import { SearchInput } from "@storevia/ui/form";
import { Icon } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@storevia/ui/surfaces";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import {
  formatDate,
  humanise,
  ORGANISATION_STATUS_TONES,
  SOURCE_LABELS,
  STATUS_TONES,
} from "@/lib/format";

export const metadata: Metadata = { title: "Organisations" };

// listOrganisationsForAdmin returns at most this many rows by default.
const PAGE_SIZE = 50;

type Organisation = Awaited<ReturnType<typeof listOrganisationsForAdmin>>[number];

function OrganisationStatus({ status }: { status: string }) {
  return (
    <Badge tone={ORGANISATION_STATUS_TONES[status] ?? "neutral"} dot>
      {humanise(status)}
    </Badge>
  );
}

function PlanName({ name }: { name: string | null }) {
  return name ? (
    <span className="text-ink">{name}</span>
  ) : (
    <span className="text-ink-muted">System default</span>
  );
}

/** Subscription status and where it comes from (manual, mock billing, provider). */
function Subscription({ org }: { org: Organisation }) {
  const status = org.subscriptionStatus as SubscriptionStatus | null;
  if (!status) return <span className="text-ink-muted">None</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
      <span className="text-caption text-ink-muted">
        {SOURCE_LABELS[org.source ?? ""] ?? org.source}
      </span>
    </span>
  );
}

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireStaff("/organisations");
  const query = ((await searchParams)["q"] ?? "").trim();
  const organisations = await listOrganisationsForAdmin(ctx, { query });
  const summary = query
    ? `${String(organisations.length)} ${organisations.length === 1 ? "match" : "matches"} for “${query}”`
    : organisations.length >= PAGE_SIZE
      ? `The ${String(PAGE_SIZE)} newest organisations. Search to find any other.`
      : `${String(organisations.length)} organisations, newest first`;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Merchants"
        title="Organisations"
        description="Every merchant organisation with its plan and subscription. Open one to manage billing, entitlements and overrides."
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <Form
            action="/organisations"
            role="search"
            aria-label="Organisations"
            className="flex w-full gap-2 md:max-w-md"
          >
            <label htmlFor="q" className="sr-only">
              Search organisations
            </label>
            <SearchInput
              id="q"
              name="q"
              defaultValue={query}
              placeholder="Search by name"
              className="min-w-0 flex-1 pointer-coarse:h-11"
            />
            <Button type="submit" variant="secondary" className="pointer-coarse:h-11">
              Search
            </Button>
          </Form>
          <p
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted"
            aria-live="polite"
          >
            <span>{summary}</span>
            {query ? (
              <Link href="/organisations" className="font-medium text-brand-700 hover:underline">
                Clear search
              </Link>
            ) : null}
          </p>
        </div>
        {organisations.length === 0 ? (
          <EmptyState
            compact
            illustration={<Illustration name="empty-search" size="sm" />}
            title="No organisations found"
            description={
              query ? "No organisation name contains that text. Try another search." : undefined
            }
          />
        ) : (
          <>
            {/* Below lg the five columns don't fit without scrolling sideways,
                so smaller screens get one link per organisation instead. */}
            <div className="hidden lg:block">
              <DataList
                caption="Organisations"
                rows={organisations}
                rowKey={(org) => org.id}
                rowTestId="organisation-row"
                columns={[
                  {
                    key: "name",
                    header: "Organisation",
                    primary: true,
                    cell: (org) => {
                      const id = toTypeId("organisation", org.id);
                      return (
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={org.name} shape="square" size="md" />
                          <span className="min-w-0">
                            <Link
                              href={`/organisations/${id}`}
                              className="block truncate font-medium text-ink hover:text-brand-700 hover:underline"
                            >
                              {org.name}
                            </Link>
                            <code className="block truncate font-mono text-[11px] text-ink-faint">
                              {id}
                            </code>
                          </span>
                        </span>
                      );
                    },
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (org) => <OrganisationStatus status={org.status} />,
                  },
                  {
                    key: "plan",
                    header: "Plan",
                    className: "whitespace-nowrap",
                    cell: (org) => <PlanName name={org.planName} />,
                  },
                  {
                    key: "subscription",
                    header: "Subscription",
                    cell: (org) => <Subscription org={org} />,
                  },
                  {
                    key: "created",
                    header: "Created",
                    className: "whitespace-nowrap text-ink-muted tabular-nums",
                    cell: (org) => formatDate(org.createdAt),
                  },
                ]}
              />
            </div>
            <ul aria-label="Organisations" className="divide-y divide-line lg:hidden">
              {organisations.map((org) => {
                const id = toTypeId("organisation", org.id);
                return (
                  <li key={org.id} data-testid="organisation-row-mobile">
                    {/* The whole row is the link: a full-width tap target. */}
                    <Link
                      href={`/organisations/${id}`}
                      className="group flex items-start gap-3 px-5 py-4 transition-colors duration-(--duration-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:px-6"
                    >
                      <Avatar name={org.name} shape="square" size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium break-words text-ink group-hover:text-brand-700">
                          {org.name}
                        </span>
                        <code className="block truncate font-mono text-[11px] text-ink-faint">
                          {id}
                        </code>
                        {/* Labelled, so the organisation's and the subscription's
                            status never read as the same thing. The organisation
                            status only shows when it needs attention. */}
                        <span className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm">
                          {org.status === "ACTIVE" ? null : (
                            <OrganisationStatus status={org.status} />
                          )}
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-ink-faint">Plan</span>
                            <PlanName name={org.planName} />
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-ink-faint">Subscription</span>
                            <Subscription org={org} />
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-ink-faint">Created</span>
                            <span className="text-ink-muted tabular-nums">
                              {formatDate(org.createdAt)}
                            </span>
                          </span>
                        </span>
                      </span>
                      <Icon
                        icon={ChevronRight}
                        size="sm"
                        className="mt-2.5 text-ink-faint group-hover:text-ink-muted"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
