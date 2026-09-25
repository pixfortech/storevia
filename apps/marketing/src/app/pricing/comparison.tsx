// Every feature by plan, from the catalogue (lib/pricing.ts). From 768 px, one
// table: its header sticks under the site header on desktop, and on tablets
// the feature column stays put while the plans scroll. On phones, a plan
// picker with that plan's features, grouped.
import { buttonClasses } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@storevia/ui/data";
import { Icon } from "@storevia/ui/icons";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { StatusPill } from "@/components/marketing/status-pill";
import { STATUS_LABELS } from "@/content/capabilities";
import type { ComparisonGroup, PricingColumn } from "@/lib/pricing";
import { PlanPicker } from "./plan-picker";

function Value({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <>
        <Icon icon={Minus} size="sm" className="inline-block text-neutral-300" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  if (value === "Included") {
    return (
      <>
        <Icon icon={Check} size="sm" className="inline-block text-brand-600" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}

// Sticks under the 64 px site header on desktop, where the table doesn't scroll sideways.
const STICKY_HEAD = "lg:sticky lg:top-16 lg:z-(--z-raised) lg:bg-surface";
// The feature column stays in view while a tablet scrolls the plans sideways.
const STICKY_COLUMN = "sticky left-0 z-(--z-raised) bg-surface lg:static";

export function ComparisonTable({
  columns,
  groups,
}: {
  columns: readonly PricingColumn[];
  groups: readonly ComparisonGroup[];
}) {
  return (
    <div className="hidden border-b border-line md:block">
      <Table
        data-testid="comparison-table"
        containerClassName="lg:overflow-visible"
        className="min-w-[45rem] table-fixed"
      >
        <TableCaption>Every feature in every plan</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className={cn(STICKY_COLUMN, STICKY_HEAD, "w-[32%] align-bottom")}>
              <span className="sr-only">Feature</span>
            </TableHead>
            {columns.map((column) => (
              <TableHead
                key={column.id}
                className={cn(STICKY_HEAD, "h-auto py-4 align-bottom whitespace-normal")}
              >
                <span className="block font-display text-body font-semibold text-ink">
                  {column.name}
                </span>
                <span className="mt-0.5 block font-normal text-ink-muted">
                  {column.price.month.summary}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {groups.map((group) => (
          <TableBody key={group.title}>
            <tr>
              <th
                scope="colgroup"
                colSpan={columns.length + 1}
                className="px-5 pt-9 pb-3 text-left sm:px-6"
              >
                <span
                  className={cn(
                    STICKY_COLUMN,
                    "inline-block text-overline text-brand-700 uppercase",
                  )}
                >
                  {group.title}
                </span>
              </th>
            </tr>
            {group.rows.map((row) => (
              <TableRow key={row.key} className="border-t border-b-0">
                <th
                  scope="row"
                  className={cn(
                    STICKY_COLUMN,
                    "h-auto py-3.5 pr-4 pl-5 text-left align-middle font-normal sm:pl-6",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-body-sm font-medium text-ink">{row.name}</span>
                    {row.status ? <StatusPill status={row.status} /> : null}
                  </span>
                  {row.description ? (
                    <span className="mt-0.5 hidden text-caption text-ink-faint lg:block">
                      {row.description}
                    </span>
                  ) : null}
                </th>
                {row.values.map((value, index) => (
                  // relative: keeps the sr-only text inside the table's scroll area.
                  <TableCell
                    key={columns[index]?.id ?? index}
                    className="relative h-auto py-3.5 text-body-sm text-ink"
                  >
                    <Value value={value} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        ))}
      </Table>
    </div>
  );
}

function PlanPanel({
  column,
  index,
  groups,
}: {
  column: PricingColumn;
  index: number;
  groups: readonly ComparisonGroup[];
}) {
  const cta = buttonClasses(column.paid ? "secondary" : "primary", "lg", "w-full");
  return (
    <div className="rounded-panel border border-line bg-surface">
      <div className="border-b border-line p-5">
        <h3 className="font-display text-h4 text-ink">{column.name}: every feature</h3>
        <p className="mt-1 text-body-sm text-ink-muted">{column.price.month.summary}</p>
      </div>
      <div className="px-5 pb-2">
        {groups.map((group) => (
          <section key={group.title} aria-label={group.title} className="pt-5">
            <p className="text-overline text-brand-700 uppercase">{group.title}</p>
            <dl className="mt-1 divide-y divide-line">
              {group.rows.map((row) => (
                <div
                  key={row.key}
                  className="flex min-h-12 items-center justify-between gap-4 py-2.5 text-body-sm"
                >
                  <dt className="min-w-0 text-ink">
                    {row.name}
                    {row.status ? (
                      <span className="block text-caption text-ink-faint">
                        {STATUS_LABELS[row.status]}
                      </span>
                    ) : null}
                  </dt>
                  <dd className="shrink-0 text-right font-medium text-ink">
                    <Value value={row.values[index] ?? null} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="border-t border-line p-5">
        {column.cta.external ? (
          <a href={column.cta.href} className={cta}>
            {column.cta.label}
          </a>
        ) : (
          <Link href={column.cta.href} className={cta}>
            {column.cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}

export function MobileComparison({
  columns,
  groups,
}: {
  columns: readonly PricingColumn[];
  groups: readonly ComparisonGroup[];
}) {
  return (
    <div className="md:hidden">
      <PlanPicker
        plans={columns.map((column, index) => ({
          id: column.id,
          name: column.name,
          panel: <PlanPanel column={column} index={index} groups={groups} />,
        }))}
      />
    </div>
  );
}
