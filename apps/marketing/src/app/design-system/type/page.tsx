import type { ReactNode } from "react";
import { ContrastTable, type ContrastPair } from "./contrast";

export const metadata = { title: "Type and colour · Design system" };

const CONTENTS = [
  ["typography", "Typography"],
  ["ramps", "Colour ramps"],
  ["semantic", "Semantic colours"],
  ["contrast", "Contrast"],
  ["shape", "Radius, elevation and spacing"],
] as const;

// Specs mirror docs/design/design-plan.md §3 and the --text-* tokens.
const TYPE = [
  [
    "display-xl",
    "64 / 1.05 · 650 · −3.5%",
    "Build your business online.",
    "font-display text-display-xl",
  ],
  ["display-l", "52 / 1.08 · 650 · −3%", "Run it from one place.", "font-display text-display-l"],
  ["h1", "40 / 1.12 · 650 · −2.5%", "Everything your store needs", "font-display text-h1"],
  ["h2", "32 / 1.18 · 650 · −2.2%", "One platform for every business", "font-display text-h2"],
  ["h3", "24 / 1.25 · 620 · −1.5%", "Teams and roles", "font-display text-h3"],
  ["h4", "19 / 1.4 · 620 · −1%", "Plan usage", "font-display text-h4"],
  [
    "body-lg",
    "18 / 1.65 · 400",
    "Storevia brings your website, commerce, content and team into one calm workspace.",
    "text-body-lg text-ink-muted",
  ],
  [
    "body",
    "16 / 1.6 · 400",
    "Every organisation starts with a free allowance of one store and one team member.",
    "text-body",
  ],
  [
    "body-sm",
    "14 / 1.5 · 400",
    "Changes are recorded in the audit trail with who made them and when.",
    "text-body-sm text-ink-muted",
  ],
  ["label", "13 / 1.35 · 550", "Store name", "text-label"],
  ["caption", "12 / 1.35 · 400", "Updated 2 minutes ago", "text-caption text-ink-faint"],
  ["overline", "11 / 1.3 · 600 · +8%", "Platform", "text-overline uppercase text-brand-700"],
  ["metric", "28 / 1.15 · 620 · −2%", "12,480", "text-metric"],
  ["metric-lg", "44 / 1.05 · 650 · −3%", "84.2%", "text-metric-lg"],
  ["table", "13 / 1.4 · 400 · tabular", "₹1,24,500.00", "text-table tabular-nums"],
] as const;

const RAMPS = [
  [
    "neutral",
    ["0", "25", "50", "100", "150", "200", "300", "400", "500", "600", "700", "800", "900", "950"],
  ],
  ["navy", ["50", "100", "600", "700", "800", "900", "950"]],
  ["brand", ["25", "50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]],
  ["accent", ["25", "50", "100", "200", "300", "400", "500", "600", "700", "800"]],
  ["sky", ["300", "400", "500"]],
  ["success", ["50", "100", "500", "600", "700"]],
  ["warning", ["50", "100", "500", "600", "700"]],
  ["danger", ["50", "100", "500", "600", "700"]],
  ["info", ["50", "100", "500", "700"]],
] as const;

const SEMANTIC = [
  [
    "Surfaces",
    [
      ["canvas", "The page"],
      ["surface", "Cards and panels"],
      ["surface-sunken", "Wells, sidebars, table heads"],
      ["subtle", "Hover and quiet fills"],
      ["muted", "Tracks and pressed fills"],
    ],
  ],
  [
    "Lines",
    [
      ["line", "Hairlines: cards, dividers, tables"],
      ["line-strong", "Emphasised hairlines"],
      ["line-control", "Control boundaries (3:1)"],
    ],
  ],
  [
    "Ink",
    [
      ["ink", "Primary text"],
      ["ink-muted", "Secondary text"],
      ["ink-faint", "Tertiary text and meta"],
      ["focus", "Focus outlines"],
      ["admin", "Internal-tool accent"],
    ],
  ],
  [
    "Data",
    [
      ["chart-1", "Primary series"],
      ["chart-2", "Comparison series"],
      ["chart-3", "Third slice, part-to-whole only"],
      ["chart-muted", "History fills (bars, segments)"],
      ["chart-history", "History lines (always dashed)"],
      ["chart-grid", "Gridlines"],
      ["chart-axis", "Axis labels"],
    ],
  ],
] as const;

const CONTRAST: readonly ContrastPair[] = [
  { fg: "ink", bg: "canvas", min: 4.5, use: "Body text" },
  { fg: "ink-muted", bg: "canvas", min: 4.5, use: "Secondary text" },
  { fg: "ink-muted", bg: "surface-sunken", min: 4.5, use: "Secondary text in wells" },
  { fg: "ink-faint", bg: "surface", min: 4.5, use: "Captions and meta" },
  { fg: "ink-faint", bg: "muted", min: 4.5, use: "Meta on tracks" },
  { fg: "brand-600", bg: "surface", min: 4.5, use: "Links and text actions" },
  { fg: "neutral-0", bg: "brand-600", min: 4.5, use: "Primary button label" },
  { fg: "brand-700", bg: "brand-50", min: 4.5, use: "Brand badge" },
  { fg: "danger-700", bg: "danger-50", min: 4.5, use: "Error badge and alert" },
  { fg: "warning-700", bg: "warning-50", min: 4.5, use: "Warning badge and alert" },
  { fg: "success-700", bg: "success-50", min: 4.5, use: "Success badge and alert" },
  { fg: "navy-900", bg: "warning-500", min: 4.5, use: "Admin environment bar" },
  { fg: "line-control", bg: "canvas", min: 3, use: "Input and checkbox borders" },
  { fg: "line-control", bg: "muted", min: 3, use: "Borders on muted fills" },
  { fg: "chart-1", bg: "canvas", min: 3, use: "Primary chart series" },
  { fg: "chart-2", bg: "canvas", min: 3, use: "Comparison chart series" },
  { fg: "chart-3", bg: "canvas", min: 3, use: "Third part-to-whole slice" },
];

const RADII = [
  ["xs", "4", "Chips, bar ends"],
  ["sm", "6", "Small controls, menu items"],
  ["control", "8", "Buttons and fields"],
  ["card", "12", "Cards"],
  ["panel", "16", "Product windows, dialogs, sheets"],
  ["pill", "∞", "Badges and pills"],
] as const;

const SHADOWS = [
  ["xs", "Pressed or small raised details"],
  ["card", "Resting cards (nearly invisible)"],
  ["raised", "Hovered cards"],
  ["popover", "Menus, popovers, toasts"],
  ["window", "Dialogs and product mockups"],
] as const;

const SPACING = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128] as const;

export default function TypePage() {
  return (
    <div className="pb-8">
      <header className="max-w-(--container-prose)">
        <p className="text-overline text-brand-700 uppercase">Foundations</p>
        <h1 className="mt-3 font-display text-h1 text-ink">Type and colour</h1>
        <p className="mt-5 text-body-lg text-ink-muted">
          Plus Jakarta Sans sets display type and headings; Inter carries the interface, reading
          text and figures. Colour is used sparingly: white surfaces, navy type, hairlines, and
          brand blue for actions, selection and data. Every value on this page comes from{" "}
          <Code>theme.css</Code>.
        </p>
      </header>

      <nav aria-label="On this page" className="mt-10 mb-4">
        <ul className="flex flex-wrap gap-2">
          {CONTENTS.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex h-8 items-center rounded-pill border border-line bg-surface px-3 text-label text-ink-muted transition-colors duration-(--duration-fast) hover:border-line-strong hover:text-ink"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-16" />

      <Section
        id="typography"
        index="01"
        title="Typography"
        description={
          <>
            Fifteen roles, each a single token (<Code>text-h2</Code>, <Code>text-body-sm</Code>)
            that sets size, line height, weight and tracking together. Headings use{" "}
            <Code>font-display</Code>; figures in columns use tabular numerals.
          </>
        }
      >
        <div className="divide-y divide-line border-y border-line">
          {TYPE.map(([name, spec, sample, className]) => (
            <div
              key={name}
              className="grid gap-2 py-6 md:grid-cols-[180px_minmax(0,1fr)] md:items-baseline md:gap-8"
            >
              <div>
                <p className="font-mono text-caption text-ink">{name}</p>
                <p className="mt-1 text-caption tabular-nums text-ink-faint">{spec}</p>
              </div>
              <p className={`${className} min-w-0 break-words`}>{sample}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="ramps"
        index="02"
        title="Colour ramps"
        description="The raw scales behind the semantic colours. Neutrals are cool and slightly blue, to sit with the navy type; status colours are reserved for status and never used as chart series."
      >
        <div className="space-y-8">
          {RAMPS.map(([ramp, steps]) => (
            <div key={ramp}>
              <p className="text-label text-ink">{ramp}</p>
              <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-7 md:grid-cols-14">
                {steps.map((step) => (
                  <div key={step}>
                    <div
                      className="h-12 rounded-sm border border-line"
                      style={{ background: `var(--color-${ramp}-${step})` }}
                    />
                    <p className="mt-1.5 text-caption tabular-nums text-ink-faint">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="semantic"
        index="03"
        title="Semantic colours"
        description="Components use these names, not ramp steps, so a change of value is made once. Each has one job."
      >
        <div className="grid gap-10 sm:grid-cols-2">
          {SEMANTIC.map(([group, tokens]) => (
            <div key={group}>
              <p className="text-overline text-ink-faint uppercase">{group}</p>
              <ul className="mt-4 space-y-3">
                {tokens.map(([name, use]) => (
                  <li key={name} className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className="size-10 shrink-0 rounded-control border border-line"
                      style={{ background: `var(--color-${name})` }}
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-caption text-ink">{name}</span>
                      <span className="block text-body-sm text-ink-muted">{use}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="contrast"
        index="04"
        title="Contrast"
        description={
          <>
            WCAG 2.2 AA: 4.5:1 for text, 3:1 for control boundaries and chart series. Ratios are
            measured from the live tokens; the same pairs fail the build if a value drifts (
            <Code>theme.test.ts</Code>). The history grey is deliberately faint, so charts always
            draw it dashed and back it with a legend and a table.
          </>
        }
      >
        <ContrastTable pairs={CONTRAST} />
      </Section>

      <Section
        id="shape"
        index="05"
        title="Radius, elevation and spacing"
        description="Restrained radii, a hairline before any shadow, and a 4 px spacing base with a small set of rhythm steps."
      >
        <div className="space-y-14">
          <div>
            <p className="text-overline text-ink-faint uppercase">Radius</p>
            <ul className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {RADII.map(([name, px, use]) => (
                <li key={name}>
                  <div
                    className="h-20 border border-line-control bg-subtle"
                    style={{ borderRadius: `var(--radius-${name})` }}
                  />
                  <p className="mt-3 font-mono text-caption text-ink">
                    {name} · {px}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-faint">{use}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-overline text-ink-faint uppercase">Elevation</p>
            <ul className="mt-5 grid gap-6 rounded-panel bg-surface-sunken p-6 sm:grid-cols-3 sm:p-8 lg:grid-cols-5">
              {SHADOWS.map(([name, use]) => (
                <li key={name}>
                  <div
                    className="h-20 rounded-card border border-line bg-surface"
                    style={{ boxShadow: `var(--shadow-${name})` }}
                  />
                  <p className="mt-3 font-mono text-caption text-ink">{name}</p>
                  <p className="mt-0.5 text-caption text-ink-faint">{use}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-overline text-ink-faint uppercase">Spacing</p>
            <ul className="mt-5 space-y-2.5">
              {SPACING.map((px) => (
                <li key={px} className="flex items-center gap-4">
                  <span className="w-10 shrink-0 text-right text-caption tabular-nums text-ink-faint">
                    {px}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-3 rounded-xs bg-brand-100"
                    style={{ width: px }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  id,
  index,
  title,
  description,
  children,
}: {
  id: string;
  index: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
        <div>
          <p className="text-caption tabular-nums text-ink-faint">{index}</p>
          <h2 className="mt-2 font-display text-h2 text-ink">{title}</h2>
        </div>
        {description ? (
          <div className="max-w-(--container-prose) text-body text-ink-muted lg:pt-7">
            {description}
          </div>
        ) : null}
      </div>
      <div className="mt-10 sm:mt-12">{children}</div>
    </section>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-xs bg-muted px-1 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}
