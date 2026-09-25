// Widgets backed by data that exists today: setup steps, the website's
// status, plan usage, the team, recent activity (the audit trail) and the
// business type's focus areas. Real figures only; each renders nothing it
// wasn't given, and the page gives each only what the member may read.
import { cn } from "@storevia/ui/cn";
import { formatBytes } from "@storevia/entitlements/format";
import { UsageMeter } from "@storevia/ui/data";
import { Progress } from "@storevia/ui/feedback";
import { Icon } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import {
  AvatarGroup,
  Badge,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  SectionHeader,
  cardClasses,
  type BadgeTone,
} from "@storevia/ui/surfaces";
import {
  ArrowRight,
  Building2,
  Check,
  CreditCard,
  Globe,
  History,
  Lock,
  ShieldCheck,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { NAV_ICONS } from "@/components/shell/icons";
import type { ActivityCategory, ActivityItem } from "@/lib/dashboard/activity";
import type { ComposedWidget } from "@/lib/dashboard/compose";
import { websiteLaunchNote, type SetupTask } from "@/lib/dashboard/setup";
import type { CatalogueSummary, LiveData, PlanSummary, TeamSummary, WebsiteSummary } from "./types";

/** A quiet text link with an arrow: the card's way onward. 44 px tall below desktop and on touch. */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mx-2 inline-flex h-11 items-center gap-1.5 rounded-control px-2 text-label font-medium text-brand-700 transition-colors hover:bg-brand-50 lg:h-9 pointer-coarse:h-11"
    >
      {children}
      <Icon icon={ArrowRight} size="sm" />
    </Link>
  );
}

/* ---------------------------------------------------------------------------
 * Get set up
 * ------------------------------------------------------------------------- */

function Step({ task }: { task: SetupTask }) {
  return (
    <li className="flex gap-4 px-5 py-4 sm:px-6">
      <span
        aria-hidden="true"
        className={
          task.done
            ? "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
            : "mt-0.5 size-6 shrink-0 rounded-full border-[1.5px] border-dashed border-line-control"
        }
      >
        {task.done ? <Icon icon={Check} size="xs" strokeWidth={2.5} /> : null}
      </span>
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className={cn("text-body-sm font-medium", task.done ? "text-ink-muted" : "text-ink")}>
            {task.title}
            {task.done ? <span className="sr-only"> (done)</span> : null}
          </p>
          <p className="mt-0.5 text-body-sm text-ink-muted">{task.description}</p>
        </div>
        {task.href && task.action ? (
          <Link
            href={task.href}
            className="-ml-3 mt-1 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control px-3 text-label font-medium text-brand-700 transition-colors hover:bg-brand-50 sm:mt-0 sm:ml-0 lg:h-9 pointer-coarse:h-11"
          >
            {task.action}
            <Icon icon={ArrowRight} size="sm" />
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function SetupCard({
  widget,
  tasks,
}: {
  widget: ComposedWidget;
  tasks: readonly SetupTask[];
}) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <Card>
      <CardHeader
        divider={false}
        title={widget.title}
        description={widget.description}
        actions={
          <span className="text-caption text-ink-muted tabular-nums">
            {done} of {tasks.length} done
          </span>
        }
      />
      <div className="border-b border-line px-5 pt-3.5 pb-4 sm:px-6">
        <Progress
          value={done}
          max={tasks.length}
          size="sm"
          aria-label="Setup progress"
          valueText={`${String(done)} of ${String(tasks.length)} steps done`}
        />
      </div>
      <ol className="divide-y divide-line">
        {tasks.map((task) => (
          <Step key={task.key} task={task} />
        ))}
      </ol>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Website status
 * ------------------------------------------------------------------------- */

export function WebsiteCard({ widget, site }: { widget: ComposedWidget; site: WebsiteSummary }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        divider={false}
        title={widget.title}
        actions={
          // No store serves visitors until storefronts launch, whatever its status.
          <Badge variant="dot" size="sm">
            Not live yet
          </Badge>
        }
      />
      <CardBody className="flex-1 pt-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-subtle text-ink-muted ring-1 ring-line ring-inset">
            <Icon icon={Globe} size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-caption text-ink-faint">Web address</p>
            <p className="mt-0.5 text-body-sm font-medium break-words text-ink">
              {site.hostname
                ? // Let long hostnames wrap after a dot, not mid-label.
                  site.hostname.split(".").map((label, i) => (
                    <Fragment key={i}>
                      {i > 0 ? (
                        <>
                          .<wbr />
                        </>
                      ) : null}
                      {label}
                    </Fragment>
                  ))
                : "No address yet"}
            </p>
          </div>
        </div>
        <p className="mt-4 text-caption text-ink-muted">{websiteLaunchNote()}</p>
        {/* Time zones are the longest value, so they get the widest column. */}
        <dl className="mt-5 grid grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,6fr)] gap-3 border-t border-line pt-4">
          {[
            ["Currency", site.currency],
            ["Language", site.locale],
            ["Time zone", site.timezone],
          ].map(([term, detail]) => (
            <div key={term} className="min-w-0">
              <dt className="text-caption text-ink-faint">{term}</dt>
              <dd className="mt-0.5 truncate text-label text-ink" title={detail}>
                {detail}
              </dd>
            </div>
          ))}
        </dl>
      </CardBody>
      <CardFooter className="justify-start py-1.5">
        <CardLink href={site.settingsHref}>Store settings</CardLink>
      </CardFooter>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Plan usage
 * ------------------------------------------------------------------------- */

export function PlanUsageCard({ widget, plan }: { widget: ComposedWidget; plan: PlanSummary }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        divider={false}
        title={plan.name}
        description={widget.description}
        actions={
          plan.status ? (
            <Badge variant="dot" size="sm" tone={plan.status.tone}>
              {plan.status.label}
            </Badge>
          ) : undefined
        }
      />
      <CardBody className="flex-1 space-y-4 pt-4">
        {plan.usage.map((line) => (
          <UsageMeter
            key={line.key}
            size="sm"
            label={line.label}
            used={line.used}
            limit={line.limit}
            {...(line.bytes
              ? { format: (value: number) => formatBytes(BigInt(Math.round(value))) }
              : {})}
          />
        ))}
        {plan.note ? <p className="text-caption text-ink-faint">{plan.note}</p> : null}
      </CardBody>
      <CardFooter className="justify-start py-1.5">
        <CardLink href={plan.href}>Plan and usage</CardLink>
      </CardFooter>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Team
 * ------------------------------------------------------------------------- */

export function TeamCard({ widget, team }: { widget: ComposedWidget; team: TeamSummary }) {
  const count = team.people.length;
  return (
    <Card className="flex flex-col">
      <CardHeader
        divider={false}
        title={widget.title}
        description={`${String(count)} ${count === 1 ? "member" : "members"} in ${team.organisationName}`}
      />
      <CardBody className="flex-1 pt-4">
        <div className="flex items-center gap-3">
          <AvatarGroup people={team.people} max={5} label="Team members" />
          <p className="min-w-0 text-caption text-ink-muted">{team.roles}</p>
        </div>
      </CardBody>
      <CardFooter className="justify-between py-1.5">
        <CardLink href={team.href}>Members</CardLink>
        {team.inviteHref ? <CardLink href={team.inviteHref}>Invite</CardLink> : null}
      </CardFooter>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Recent activity
 * ------------------------------------------------------------------------- */

const ACTIVITY_ICONS: Record<ActivityCategory, LucideIcon> = {
  team: Users,
  store: Store,
  plan: CreditCard,
  organisation: Building2,
  security: ShieldCheck,
  other: History,
};

export function ActivityCard({
  widget,
  items,
}: {
  widget: ComposedWidget;
  items: readonly ActivityItem[];
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader title={widget.title} description={widget.description} />
      {items.length > 0 ? (
        <ol className="flex-1 space-y-3.5 px-5 py-4.5 sm:px-6">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-muted ring-1 ring-line ring-inset">
                <Icon icon={ACTIVITY_ICONS[item.category]} size="xs" />
              </span>
              <p className="min-w-0 pt-0.5 text-body-sm text-ink-muted">
                <span className="font-medium text-ink">{item.actor}</span> {item.summary}{" "}
                {/* The time never wraps away from its separator. */}
                <span className="whitespace-nowrap text-caption text-ink-faint">
                  <span aria-hidden="true">· </span>
                  <time dateTime={item.at} title={item.exact}>
                    {item.when}
                  </time>
                </span>
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          compact
          titleAs="h3"
          illustration={<Illustration name="empty-activity" size="sm" />}
          title="No activity yet"
          description="Changes to this store, your team and your plan appear here."
        />
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Focus areas
 * ------------------------------------------------------------------------- */

function availabilityBadge(availability: string | undefined): { label: string; tone: BadgeTone } {
  if (!availability) return { label: "Available", tone: "success" };
  return {
    label: availability === "a later release" ? "Later release" : availability,
    tone: "neutral",
  };
}

export function FocusBand({ widget, areas }: { widget: ComposedWidget; areas: LiveData["focus"] }) {
  if (areas.length === 0) return null;
  return (
    <section aria-labelledby="dashboard-focus" className="pt-2">
      <SectionHeader
        title={<span id="dashboard-focus">{widget.title}</span>}
        description={widget.description}
      />
      <ul
        className={cn(
          "mt-4 grid gap-3 sm:gap-4",
          areas.length >= 3 ? "sm:grid-cols-3" : areas.length === 2 && "sm:grid-cols-2",
        )}
      >
        {areas.map(({ area, locked, href }) => {
          const badge = availabilityBadge(area.availability);
          const id = `focus-${area.key}`;
          return (
            <li key={area.key} className="flex">
              {/* Named by the area first ("Media, Milestone 3"), then described. */}
              <Link
                href={href}
                aria-labelledby={`${id}-label ${id}-status`}
                aria-describedby={`${id}-description`}
                className={cardClasses("interactive", "flex flex-1 flex-col p-4 sm:p-5")}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex size-9 items-center justify-center rounded-control bg-subtle text-ink-muted ring-1 ring-line ring-inset">
                    <Icon icon={NAV_ICONS[area.key]} size="md" />
                  </span>
                  <span id={`${id}-status`} className="flex items-center gap-2">
                    {locked ? (
                      <Icon
                        icon={Lock}
                        size="xs"
                        label="Not included in your plan"
                        className="text-ink-faint"
                      />
                    ) : null}
                    <Badge size="sm" variant="outline" tone={badge.tone}>
                      {badge.label}
                    </Badge>
                  </span>
                </span>
                <span id={`${id}-label`} className="mt-4 text-body-sm font-semibold text-ink">
                  {area.label}
                </span>
                <span id={`${id}-description`} className="mt-1 text-body-sm text-ink-muted">
                  {area.description}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Catalogue (Milestone 3): real product and stock numbers
 * ------------------------------------------------------------------------- */

const STATUS_TONE: Record<"DRAFT" | "ACTIVE" | "ARCHIVED", BadgeTone> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  ARCHIVED: "warning",
};

export function CatalogueCard({
  widget,
  catalogue,
}: {
  widget: ComposedWidget;
  catalogue: CatalogueSummary;
}) {
  const { products } = catalogue;
  return (
    <Card className="flex flex-col" data-testid="widget-catalogue">
      <CardHeader divider={false} title={widget.title} description={widget.description} />
      <CardBody className="flex-1 space-y-4 pt-4">
        {products.total === 0 ? (
          <p className="text-body-sm text-ink-muted">
            No products yet. Add one with a title, a price and a photo.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-3">
              {[
                { label: "Products", value: products.total },
                { label: "Active", value: products.active },
                { label: "Drafts", value: products.draft },
              ].map((item) => (
                <div key={item.label} className="rounded-control bg-subtle px-3 py-2.5">
                  <dt className="text-caption text-ink-muted">{item.label}</dt>
                  <dd className="font-display text-title-sm font-semibold text-ink tabular-nums">
                    {item.value.toLocaleString("en-IN")}
                  </dd>
                </div>
              ))}
            </dl>
            {catalogue.recentlyUpdated.length > 0 ? (
              <div>
                <p className="mb-1.5 text-caption font-medium text-ink-faint">Recently updated</p>
                <ul className="divide-y divide-line">
                  {catalogue.recentlyUpdated.map((p) => (
                    <li key={p.href} className="flex items-center justify-between gap-3 py-2">
                      <Link
                        href={p.href}
                        className="min-w-0 truncate text-body-sm font-medium text-ink hover:text-brand-700"
                      >
                        {p.title}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge size="sm" variant="dot" tone={STATUS_TONE[p.status]}>
                          {p.status === "ACTIVE"
                            ? "Active"
                            : p.status === "DRAFT"
                              ? "Draft"
                              : "Archived"}
                        </Badge>
                        <span className="hidden text-caption text-ink-faint sm:inline">
                          {p.when}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardBody>
      <CardFooter className="justify-between py-1.5">
        <CardLink href={catalogue.productsHref}>All products</CardLink>
        {catalogue.newProductHref ? (
          <CardLink href={catalogue.newProductHref}>Add product</CardLink>
        ) : null}
      </CardFooter>
    </Card>
  );
}

export function StockAlertsCard({
  widget,
  catalogue,
}: {
  widget: ComposedWidget;
  catalogue: CatalogueSummary;
}) {
  const nothing = catalogue.lowStockVariants === 0 && catalogue.outOfStockVariants === 0;
  return (
    <Card className="flex flex-col" data-testid="widget-stock-alerts">
      <CardHeader divider={false} title={widget.title} description={widget.description} />
      <CardBody className="flex-1 space-y-4 pt-4">
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-control bg-subtle px-3 py-2.5">
            <dt className="text-caption text-ink-muted">Out of stock</dt>
            <dd
              className={cn(
                "font-display text-title-sm font-semibold tabular-nums",
                catalogue.outOfStockVariants > 0 ? "text-danger-700" : "text-ink",
              )}
            >
              {catalogue.outOfStockVariants.toLocaleString("en-IN")}
            </dd>
          </div>
          <div className="rounded-control bg-subtle px-3 py-2.5">
            <dt className="text-caption text-ink-muted">Low (≤ {catalogue.lowStockThreshold})</dt>
            <dd
              className={cn(
                "font-display text-title-sm font-semibold tabular-nums",
                catalogue.lowStockVariants > 0 ? "text-warning-700" : "text-ink",
              )}
            >
              {catalogue.lowStockVariants.toLocaleString("en-IN")}
            </dd>
          </div>
        </dl>
        {nothing ? (
          <p className="flex items-center gap-2 text-body-sm text-ink-muted">
            <Icon icon={Check} size="sm" className="text-success-600" />
            Every tracked variant has stock to sell.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {catalogue.lowStock.map((item) => (
              <li
                key={`${item.href}-${item.label}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <Link
                  href={item.href}
                  className="min-w-0 truncate text-body-sm text-ink hover:text-brand-700"
                >
                  {item.label}
                </Link>
                <span
                  className={cn(
                    "shrink-0 text-body-sm font-medium tabular-nums",
                    item.available <= 0 ? "text-danger-700" : "text-warning-700",
                  )}
                >
                  {item.available.toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter className="justify-start py-1.5">
        <CardLink href={catalogue.inventoryHref}>Inventory</CardLink>
      </CardFooter>
    </Card>
  );
}
