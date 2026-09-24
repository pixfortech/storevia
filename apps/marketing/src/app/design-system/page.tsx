import { Icon } from "@storevia/ui";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Design system" };

const PRINCIPLES = [
  [
    "White first",
    "Premium comes from type, space, hairlines and a few precise shadows, never from colour volume, gradients or glass.",
  ],
  [
    "One action colour",
    "Brand blue marks actions, the current selection and data. Violet is a rare second voice; navy carries the type.",
  ],
  [
    "Honest by default",
    "Unfinished features say when they arrive. Example data is labelled. Nothing invents a metric, a customer or a review.",
  ],
  [
    "Accessible as a baseline",
    "Text pairs are tested for AA contrast, control borders for 3:1. Everything works by keyboard and without motion.",
  ],
] as const;

const SECTIONS = [
  {
    slug: "type",
    group: "Foundations",
    title: "Type and colour",
    description:
      "Type roles, colour ramps, semantic colours, contrast, radius, elevation and spacing.",
  },
  {
    slug: "brand",
    group: "Foundations",
    title: "Brand",
    description:
      "The ribbon mark and wordmark, interface icons, Storevia glyphs, empty-state illustrations and business scenes.",
  },
  {
    slug: "motion",
    group: "Foundations",
    title: "Motion",
    description:
      "Entrances, staggering, counting numbers, chart reveals and hover lift. All of it respects reduced motion.",
  },
  {
    slug: "controls",
    group: "Components",
    title: "Controls",
    description:
      "Buttons, fields, search, combobox, date range, selection, tabs, navigation, tooltips, popovers, toasts and progress.",
  },
  {
    slug: "surfaces",
    group: "Components",
    title: "Surfaces",
    description:
      "Cards, page headers, badges, alerts, empty states, metrics, tables, dialogs, drawers, sheets, menus and the command menu.",
  },
  {
    slug: "charts",
    group: "Data",
    title: "Charts",
    description:
      "Line, area, bar, donut and sparkline charts with legends, tooltips, table fallbacks and honest empty states.",
  },
] as const;

export default function DesignSystemIndex() {
  return (
    <div className="pb-8">
      <header className="max-w-(--container-prose)">
        <p className="text-overline text-brand-700 uppercase">Storevia</p>
        <h1 className="mt-3 font-display text-h1 text-ink">Design system</h1>
        <p className="mt-5 text-body-lg text-ink-muted">
          The shared foundations and components behind the marketing site, the merchant dashboard
          and platform admin. Tokens live in <Code>packages/ui/src/theme.css</Code>, components ship
          from <Code>@storevia/ui</Code>, and the rules are in{" "}
          <Code>docs/design/design-plan.md</Code>. Content in the examples is illustrative. This
          gallery exists for development and review only and is never served in production.
        </p>
      </header>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map(([title, body], index) => (
          <li key={title} className="bg-surface p-6">
            <p className="text-caption tabular-nums text-brand-700">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-3 font-display text-h4 text-ink">{title}</p>
            <p className="mt-2 text-body-sm text-ink-muted">{body}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="sections-heading" className="mt-20 border-t border-line pt-16">
        <h2 id="sections-heading" className="font-display text-h2 text-ink">
          Sections
        </h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section, index) => (
            <li key={section.slug}>
              <Link
                href={`/design-system/${section.slug}`}
                className="group flex h-full flex-col rounded-panel border border-line bg-surface p-6 transition-[border-color,box-shadow] duration-(--duration-base) ease-(--ease-standard) hover:border-line-strong hover:shadow-raised"
              >
                <span className="flex items-center justify-between gap-4">
                  <span className="text-caption tabular-nums text-ink-faint">
                    {String(index + 1).padStart(2, "0")} · {section.group}
                  </span>
                  <Icon
                    icon={ArrowUpRight}
                    className="text-ink-faint transition-colors duration-(--duration-fast) group-hover:text-brand-600"
                  />
                </span>
                <span className="mt-6 font-display text-h4 text-ink">{section.title}</span>
                <span className="mt-2 text-body-sm text-ink-muted">{section.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded-xs bg-muted px-1 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}
