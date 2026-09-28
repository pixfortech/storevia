import {
  AUDIT_AREAS,
  hasPermission,
  isAuditArea,
  listAuditLog,
  listStores,
  type ActivityEntry,
  type AuditArea,
} from "@storevia/tenancy";
import { buttonClasses } from "@storevia/ui/button";
import { DataList } from "@storevia/ui/data";
import { Badge, Card, CardHeader, EmptyState } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { describeActivity } from "@/lib/dashboard/activity";
import { orgPath } from "@/lib/ids";
import { organisationContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Audit log" };

// The organisation's audit log (M8): every recorded change, newest first.
// Read-only: nothing here edits or deletes an entry, and the database grants
// the app role no UPDATE or DELETE on the table. Rows carry display-safe
// fields only (listAuditLog): no IP addresses, user agents or emails.

const AREA_LABELS: Record<AuditArea, string> = {
  team: "Team",
  organisation: "Organisation",
  stores: "Stores",
  catalogue: "Catalogue",
  orders: "Orders",
  website: "Website",
  settings: "Settings",
  billing: "Billing",
  security: "Sign-in and security",
};

const DESCRIPTION =
  "Every change recorded in this organisation: who made it and when. Entries can't be edited or removed.";

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgId } = await params;
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}/audit`);
  if (!hasPermission(ctx, "audit.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.organisationName} title="Audit log" />
        <AccessNotice title="You can't view the audit log">
          Owners and admins can see the audit log. Ask one of them if you need to know who changed
          something.
        </AccessNotice>
      </>
    );
  }
  const query = await searchParams;
  const requested = query["area"] ?? "";
  const area = isAuditArea(requested) ? requested : undefined;
  const before = query["before"] ?? null;
  const [page, stores] = await Promise.all([
    listAuditLog(ctx, { area, before }),
    hasPermission(ctx, "store.read") ? listStores(ctx) : [],
  ]);
  const storeNames = new Map(stores.map((s) => [s.id, s.name] as const));
  const now = new Date();
  const base = orgPath(ctx.organisationId, "/audit");
  const href = (next: { area?: AuditArea | undefined; before?: string }) => {
    const search = new URLSearchParams();
    if (next.area) search.set("area", next.area);
    if (next.before) search.set("before", next.before);
    const text = search.toString();
    return text ? `${base}?${text}` : base;
  };
  const rows = page.entries.map((entry) => ({ entry, item: describeActivity(entry, { now }) }));
  const storeLabel = (entry: ActivityEntry) =>
    entry.storeId ? (storeNames.get(entry.storeId) ?? "A store") : "Organisation";

  return (
    <>
      <PageHeader
        eyebrow={ctx.organisationName}
        title="Audit log"
        description={DESCRIPTION}
        meta={<Badge variant="outline">Read-only</Badge>}
      />
      <nav aria-label="Filter by area" className="mb-6 flex flex-wrap gap-2">
        {[undefined, ...(Object.keys(AUDIT_AREAS) as AuditArea[])].map((key) => {
          const current = key === area;
          return (
            <Link
              key={key ?? "all"}
              href={href({ area: key })}
              aria-current={current ? "page" : undefined}
              className={buttonClasses(current ? "primary" : "secondary", "sm")}
            >
              {key ? AREA_LABELS[key] : "All"}
            </Link>
          );
        })}
      </nav>
      <Card>
        <CardHeader
          title={area ? AREA_LABELS[area] : "All events"}
          description={before ? "Older events" : "Newest first"}
        />
        <DataList
          rows={rows}
          rowKey={(row) => row.entry.id}
          rowTestId="audit-entry"
          caption="Audit log entries"
          empty={
            <EmptyState
              title="Nothing recorded"
              description={
                area
                  ? "No events in this area yet."
                  : "Changes appear here as soon as they are made."
              }
            />
          }
          columns={[
            {
              key: "event",
              header: "Event",
              primary: true,
              cell: (row) => <span>{row.item.sentence}</span>,
            },
            {
              key: "where",
              header: "Where",
              cell: (row) => <span className="text-ink-muted">{storeLabel(row.entry)}</span>,
            },
            {
              key: "action",
              header: "Action",
              hideOnMobile: true,
              cell: (row) => (
                <code className="font-mono text-caption text-ink-muted">{row.entry.action}</code>
              ),
            },
            {
              key: "when",
              header: "When",
              align: "end",
              cell: (row) => (
                <time dateTime={row.item.at} title={row.item.exact} className="whitespace-nowrap">
                  {row.item.exact}
                </time>
              ),
            },
          ]}
        />
      </Card>
      <div className="mt-6 flex flex-wrap gap-3">
        {before ? (
          <Link href={href({ area })} className={buttonClasses("secondary", "md")}>
            Newest events
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link
            href={href({ area, before: page.nextCursor })}
            className={buttonClasses("secondary", "md")}
          >
            Older events
          </Link>
        ) : null}
      </div>
    </>
  );
}
