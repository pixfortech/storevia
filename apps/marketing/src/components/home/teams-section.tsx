// 10 Team collaboration: what teams can do today, beside a real permission
// table read from the RBAC definitions the server enforces (role-matrix.ts).
// A live table, not a mockup: every cell is true of the product. Access to
// selected stores isn't settable in the dashboard yet, so that point carries
// its own status and the plans that will include it (from the catalogue).
import type { PublicCatalogue } from "@storevia/entitlements/catalogue";
import {
  Icon,
  Reveal,
  SlideReveal,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@storevia/ui";
import { KeyRound, Minus, Shield, Store, UserPlus, Users } from "lucide-react";
import { Section, SectionHeading, StatusPill } from "@/components/marketing";
import { capability, type Status } from "@/content/capabilities";
import { FEATURE_STATUS } from "@/content/plan-features";
import { planAvailability } from "@/lib/pricing";
import { MATRIX_AREAS, roleMatrix } from "./role-matrix";

interface Point {
  readonly icon: typeof Users;
  readonly title: string;
  readonly description: string;
  /** Present when the point isn't live yet. */
  readonly status?: Status;
  /** Which plans include it ("Business and Enterprise"), when it's plan-gated. */
  readonly plans?: string | null;
}

const POINTS: readonly Point[] = [
  {
    icon: Users,
    title: "Roles",
    description: "Standard roles from owner to author, with suggestions for your business type.",
  },
  {
    icon: KeyRound,
    title: "Permissions",
    description: "Each role maps to precise permissions, checked on every request.",
  },
  {
    icon: UserPlus,
    title: "Staff",
    description: "Invite people by email, suspend access and transfer ownership.",
  },
  {
    icon: Shield,
    title: "Secure management",
    description: "Sensitive changes ask for your password and are kept in an audit trail.",
  },
];

export function TeamsSection({ catalogue }: { catalogue: PublicCatalogue | null }) {
  const teams = capability("teams");
  const rows = roleMatrix();
  const plans = catalogue ? planAvailability(catalogue, "advanced_permissions") : null;
  const points: readonly Point[] = [
    ...POINTS.slice(0, 3),
    {
      icon: Store,
      title: "Access to selected stores",
      description: "Give someone only the stores they work on, and no others.",
      status: FEATURE_STATUS.advanced_permissions,
      plans,
    },
    ...POINTS.slice(3),
  ];
  return (
    <Section labelledBy="teams-heading" tone="tinted">
      <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <Reveal className="min-w-0">
          <SectionHeading
            id="teams-heading"
            eyebrow="Team collaboration"
            status={teams.status}
            title="Give everyone exactly the access they need"
            lead="Bring in staff, freelancers and writers without handing over the keys. Access follows the role, never the other way round."
          />
          <ul className="mt-9 space-y-5">
            {points.map((point) => (
              <li key={point.title} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink">
                  <Icon icon={point.icon} size="sm" />
                </span>
                <span>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-body font-semibold text-ink">{point.title}</span>
                    {point.status && point.status !== "available" ? (
                      <StatusPill status={point.status} />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-body-sm text-ink-muted">
                    {point.description}
                  </span>
                  {point.plans ? (
                    <span className="mt-1 block text-caption text-ink-faint">
                      Plans: {point.plans}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
        <SlideReveal direction="left" className="min-w-0 self-center">
          <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4 sm:px-6">
              <h3 className="font-display text-body font-semibold text-ink">Who can do what</h3>
              <p className="text-caption text-ink-faint">
                Read from Storevia&apos;s role definitions
              </p>
            </div>
            <Table aria-label="Access by role">
              <TableCaption>
                The strongest access each role has in five areas. A dash means no access.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Role</TableHead>
                  {MATRIX_AREAS.map((area) => (
                    <TableHead key={area.label} scope="col">
                      {area.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.role}>
                    <TableHead
                      scope="row"
                      className="h-auto text-table font-medium text-ink shadow-none"
                    >
                      {row.label}
                    </TableHead>
                    {row.cells.map((cell, index) => (
                      <TableCell key={MATRIX_AREAS[index]?.label ?? index}>
                        {cell ?? (
                          <>
                            <Icon icon={Minus} size="xs" className="text-neutral-400" />
                            <span className="sr-only">No access</span>
                          </>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SlideReveal>
      </div>
    </Section>
  );
}
