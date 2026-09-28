import {
  getDomainsOverview,
  type AdminDomainRow,
  type DomainStatusFilter,
} from "@storevia/billing";
import { DOMAIN_REASONS, isDomainReason } from "@storevia/domains";
import { hasPlatformPermission } from "@storevia/tenancy/platform";
import { toTypeId } from "@storevia/types";
import { Button } from "@storevia/ui/button";
import { DataList, Stat } from "@storevia/ui/data";
import { SearchInput } from "@storevia/ui/form";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Domains" };

// Read-only custom-domain diagnostics (ADR-0032 §9): every store's domains,
// their state and why one isn't active. No controls: merchants add, check
// and remove their domains; the worker verifies them.

const DESCRIPTION =
  "Merchant custom domains and their verification state. Read-only: merchants manage their domains, and the worker checks them.";

const STATUSES: readonly DomainStatusFilter[] = ["ALL", "FAILED", "PENDING", "VERIFYING", "ACTIVE"];

const STATUS: Record<
  AdminDomainRow["status"],
  { label: string; tone: "neutral" | "success" | "warning" | "danger" }
> = {
  ACTIVE: { label: "Active", tone: "success" },
  VERIFYING: { label: "Verifying", tone: "warning" },
  PENDING: { label: "Pending", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
};

const reasonText = (reason: string | null) =>
  reason ? (isDomainReason(reason) ? DOMAIN_REASONS[reason] : reason) : "—";

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireStaff("/domains");
  if (!hasPlatformPermission(ctx, "platform.audit.read")) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Operations" title="Domains" description={DESCRIPTION} />
        <Alert tone="warning" title="You can't view domains">
          Your platform role doesn&apos;t include operational visibility.
        </Alert>
      </div>
    );
  }
  const params = await searchParams;
  const query = (params["q"] ?? "").trim();
  const requested = (params["status"] ?? "ALL").toUpperCase();
  const status = STATUSES.find((s) => s === requested) ?? "ALL";
  const overview = await getDomainsOverview(ctx, { status, query });
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Domains"
        description={DESCRIPTION}
        meta={<Badge variant="outline">Read-only</Badge>}
      />
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4 [&>div]:bg-surface [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-6">
        <Stat label="Active" value={overview.counts.ACTIVE} />
        <Stat label="Verifying" value={overview.counts.VERIFYING} />
        <Stat label="Pending" value={overview.counts.PENDING} />
        <Stat
          label="Failed"
          value={
            <span className={overview.counts.FAILED > 0 ? "text-danger-700" : undefined}>
              {overview.counts.FAILED}
            </span>
          }
        />
      </dl>
      <Card data-testid="domains-card">
        <CardHeader title="Custom domains" description="Problems first, then newest changes." />
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:px-6 md:flex-row md:items-center">
          <Form
            action="/domains"
            role="search"
            aria-label="Domains"
            className="flex w-full flex-wrap gap-2"
          >
            <label htmlFor="q" className="sr-only">
              Search domains
            </label>
            <SearchInput
              id="q"
              name="q"
              defaultValue={query}
              placeholder="Search by hostname"
              className="min-w-0 flex-1 pointer-coarse:h-11"
            />
            <label htmlFor="status" className="sr-only">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="h-10 rounded-md border border-line-strong bg-surface px-3 text-body-sm pointer-coarse:h-11"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "All statuses" : STATUS[s].label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" className="pointer-coarse:h-11">
              Filter
            </Button>
          </Form>
        </div>
        {overview.truncated ? (
          <p className="border-b border-line px-5 py-3 text-body-sm text-ink-muted sm:px-6">
            Showing the 200 most recently changed. Search or filter to find others.
          </p>
        ) : null}
        <DataList
          caption="Custom domains"
          rows={overview.rows}
          rowKey={(d) => d.id}
          rowTestId="domain-row"
          empty={<p className="px-5 py-6 text-body-sm text-ink-muted sm:px-6">No domains match.</p>}
          columns={[
            {
              key: "hostname",
              header: "Domain",
              primary: true,
              cell: (d) => (
                <span className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-[13px] break-all text-ink">{d.hostname}</code>
                  {d.isPrimary ? <Badge size="sm">Primary</Badge> : null}
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (d) => (
                <Badge tone={STATUS[d.status].tone} dot>
                  {STATUS[d.status].label}
                </Badge>
              ),
            },
            {
              key: "store",
              header: "Store",
              cell: (d) => (
                <span className="grid">
                  <Link
                    href={`/organisations/${toTypeId("organisation", d.organisation.id)}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {d.organisation.name}
                  </Link>
                  <span className="text-caption text-ink-muted">
                    {d.store.name} ({d.store.slug})
                  </span>
                </span>
              ),
            },
            {
              key: "reason",
              header: "Why",
              cell: (d) => (
                <span className="text-body-sm text-ink-muted">{reasonText(d.failureReason)}</span>
              ),
            },
            {
              key: "checked",
              header: "Last checked",
              className: "whitespace-nowrap tabular-nums text-ink-muted",
              cell: (d) => (
                <span className="grid">
                  <span>{formatDateTime(d.lastCheckedAt)}</span>
                  <span className="text-caption">
                    {d.checkAttempts > 0 ? `${String(d.checkAttempts)} checks` : null}
                    {d.provider ? ` · ${d.provider}` : null}
                  </span>
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
