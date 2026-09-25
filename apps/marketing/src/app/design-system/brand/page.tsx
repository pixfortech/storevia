import {
  GLYPH_NAMES,
  Glyph,
  GlyphTile,
  Icon,
  Logo,
  LogoMark,
  type GlyphName,
  type GlyphTileSize,
  type GlyphTileTone,
  type IconSize,
} from "@storevia/ui/icons";
import {
  BUSINESS_SCENE_TYPES,
  BusinessScene,
  ILLUSTRATION_NAMES,
  Illustration,
  type IllustrationName,
} from "@storevia/ui/illustrations";
import {
  Bell,
  ChartLine,
  CreditCard,
  House,
  LayoutGrid,
  Search,
  Settings,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export const metadata = { title: "Brand · Design system" };

const CONTENTS = [
  ["logo", "Logo"],
  ["icons", "Interface icons"],
  ["glyphs", "Product glyphs"],
  ["glyph-tiles", "Glyph tiles"],
  ["illustrations", "Illustrations"],
  ["scenes", "Business scenes"],
] as const;

const PRINCIPLES = [
  [
    "One ribbon",
    "The mark is a single ribbon folded twice. Glyphs and illustrations reuse its bands, folds and flat cuts at its 1-in-6 slant.",
  ],
  [
    "Gradients stay in the mark",
    "Blue into violet lives only inside the logo. Everything else is navy line, one accent and white space.",
  ],
  [
    "One accent per drawing",
    "Every glyph and illustration has exactly one blue piece, or violet for a rare secondary moment.",
  ],
  [
    "Named or hidden",
    "Brand art is decorative by default. Give it a label when it carries meaning on its own.",
  ],
] as const;

// Canonical glyphs first; the rest of GLYPH_NAMES are aliases of these.
const ALIASES: Readonly<Record<string, GlyphName>> = {
  "business-website": "website",
  publication: "publishing",
  "retail-outlet": "retail",
  store: "online-store",
};
const CANONICAL = GLYPH_NAMES.filter((name) => !(name in ALIASES));
const ACCENT_SAMPLE: readonly GlyphName[] = [
  "commerce",
  "online-store",
  "analytics",
  "integrations",
  "domains",
];

const ICON_RAMP: readonly (readonly [IconSize, string, string])[] = [
  ["sm", "16 px", "1.75"],
  ["nav", "18 px", "1.75"],
  ["md", "20 px", "1.75"],
  ["lg", "24 px", "1.75"],
  ["xl", "32 px", "1.5"],
];

const NAV_EXAMPLE: readonly (readonly [LucideIcon, string, boolean])[] = [
  [House, "Home", true],
  [LayoutGrid, "Products", false],
  [CreditCard, "Billing", false],
  [Bell, "Activity", false],
  [Search, "Search", false],
  [Settings, "Settings", false],
];

const LOGO_SIZES = [
  ["xs", "14 px wordmark"],
  ["sm", "16 px"],
  ["md", "19 px, the default"],
  ["lg", "26 px"],
  ["xl", "36 px"],
] as const;

const MARK_COLOURS = [
  ["#1F3BE8", "Top band, deep blue"],
  ["#29C5FF", "Top band, sky"],
  ["#4FA8FF", "Middle band, light"],
  ["#1A3BD9", "Middle band, deep"],
  ["#9B6BFF", "Bottom band, violet"],
  ["#6E6BFF", "Bottom band, indigo"],
  ["#4A67FF", "Dot of the i"],
  ["#0B1530", "Wordmark navy"],
] as const;

const DONTS = [
  "Recolour, outline, add shadows to or animate the mark.",
  "Redraw it with parallel bands: the alternating slants are the mark.",
  "Put the navy wordmark on dark or busy backgrounds; use the inverse.",
  "Set the wordmark in another face or re-space it; it ships as outlines.",
] as const;

/**
 * Grammar primitives on the glyphs' 24 grid: [name, note, line, accent].
 * The fold is what the glyph helper draws: legs at the slant, 10 apart.
 */
const PRIMITIVES = [
  ["Slant", "1 in 6, rising or falling", "M3 19h18V16", "M3 19 21 16"],
  ["Band", "a strip cut vertically", "", "M3 12.5 21 9.5V15L3 18z"],
  [
    "Fold",
    "a U-turn, tangent to its legs",
    "",
    "M20.01 5.6 8.18 7.57A5 5 0 0 0 9.82 17.43L21.66 15.46",
  ],
  ["Cut", "flat ends, square corners", "M15 9.5 3 11.5V17L15 15", "M15 9.5V15"],
] as const;

const TILE_TONES: readonly (readonly [GlyphTileTone, GlyphName])[] = [
  ["brand", "online-store"],
  ["accent", "publishing"],
  ["neutral", "teams"],
];
const TILE_SIZES: readonly GlyphTileSize[] = ["sm", "md", "lg", "xl"];

const EMPTY_STATES = ILLUSTRATION_NAMES.filter((name) => name.startsWith("empty-"));
const STATUS_MOMENTS = ILLUSTRATION_NAMES.filter((name) => !name.startsWith("empty-"));

type SceneKey = (typeof BUSINESS_SCENE_TYPES)[number];
const DOMAIN_SCENES = BUSINESS_SCENE_TYPES.filter((type) => type !== "retail-outlet");
const SCENE_LABELS: Record<SceneKey, [string, string]> = {
  "online-store": ["Online store", "BusinessType ECOMMERCE"],
  "business-website": ["Business website", "BusinessType BUSINESS"],
  publication: ["Publication", "BusinessType PUBLISHING"],
  portfolio: ["Portfolio", "BusinessType PORTFOLIO"],
  "retail-outlet": ["Retail outlet", "Not a business type yet"],
};

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

function Specimen({
  name,
  api,
  description,
  children,
  stage = "surface",
}: {
  name: string;
  api: string;
  description: ReactNode;
  children: ReactNode;
  stage?: "surface" | "subtle" | "none";
}) {
  return (
    <div className="grid gap-6 border-t border-line py-10 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
      <div className="lg:pt-1">
        <h3 className="font-display text-h4 text-ink">{name}</h3>
        <p className="mt-2 text-body-sm text-ink-muted">{description}</p>
        <p className="mt-4 font-mono text-caption leading-relaxed break-words text-ink-faint">
          {api}
        </p>
      </div>
      <div className="min-w-0">
        {stage === "none" ? (
          children
        ) : (
          <div
            className={
              stage === "subtle"
                ? "rounded-panel border border-line bg-subtle p-5 sm:p-8"
                : "rounded-panel border border-line bg-surface p-5 sm:p-8"
            }
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/** A small stage with its name and code on separate lines underneath. */
function Tile({
  name,
  code,
  tone = "surface",
  children,
}: {
  name: string;
  code: string;
  tone?: "surface" | "navy";
  children: ReactNode;
}) {
  return (
    <figure className="flex min-w-0 flex-col">
      <div
        className={`flex flex-1 items-center justify-center overflow-hidden rounded-card px-5 py-8 ${
          tone === "navy" ? "bg-navy-900" : "border border-line bg-surface"
        }`}
      >
        {children}
      </div>
      <figcaption className="mt-3">
        <span className="block text-label text-ink">{name}</span>
        <code className="mt-0.5 block font-mono text-caption break-words text-ink-faint">
          {code}
        </code>
      </figcaption>
    </figure>
  );
}

function IllustrationGrid({
  names,
  columns = "sm:grid-cols-3",
}: {
  names: readonly IllustrationName[];
  columns?: string;
}) {
  return (
    <ul className={`grid grid-cols-2 gap-4 ${columns}`}>
      {names.map((name) => (
        <li
          key={name}
          className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-3 pt-6 pb-4"
        >
          <Illustration name={name} className="h-auto max-w-full" />
          <code className="font-mono text-caption text-ink-faint">{name}</code>
        </li>
      ))}
    </ul>
  );
}

function SceneGrid({ types }: { types: readonly SceneKey[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {types.map((type) => (
        <li key={type}>
          <figure>
            <div className="overflow-hidden rounded-card border border-line bg-surface p-4">
              <BusinessScene type={type} />
            </div>
            <figcaption className="mt-3">
              <span className="block text-label text-ink">{SCENE_LABELS[type][0]}</span>
              <code className="mt-0.5 block font-mono text-caption text-ink-faint">{type}</code>
              <span className="block text-caption text-ink-faint">{SCENE_LABELS[type][1]}</span>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-xs bg-muted px-1 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

/**
 * The mark with its construction drawn over it, in its own viewBox units:
 * the three band centrelines (1 in 6, alternating) and the concentric fold
 * circles (outer edge and counter). Values match LogoMark.
 */
function MarkConstruction() {
  return (
    <div className="relative mx-auto w-full max-w-[216px]">
      <LogoMark label="Storevia mark" className="block h-auto w-full" />
      <svg
        viewBox="0 0 100 114"
        aria-hidden="true"
        fill="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <g
          className="stroke-navy-900/35"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        >
          <path d="M-8 28.33 108 9M-8 47.33 108 66.67M-8 105 108 85.67" />
          <circle cx="24.99" cy="37.83" r="24.99" />
          <circle cx="24.99" cy="37.83" r="4.6" />
          <circle cx="75.01" cy="76.17" r="24.99" />
          <circle cx="75.01" cy="76.17" r="4.6" />
        </g>
      </svg>
    </div>
  );
}

export default function BrandPage() {
  return (
    <div className="pb-8">
      <header className="max-w-(--container-prose)">
        <p className="text-overline text-brand-700 uppercase">Foundations</p>
        <h1 className="mt-3 font-display text-h1 text-ink">Brand</h1>
        <p className="mt-5 text-body-lg text-ink-muted">
          The ribbon mark and wordmark, interface icons, Storevia&rsquo;s product glyphs and
          illustrations. One language throughout: the mark&rsquo;s bands, folds and flat cuts, drawn
          in navy line with a single blue accent. Everything here ships from{" "}
          <Code>@storevia/ui</Code>; gradients appear only inside the mark.
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

      <ol className="mt-10 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="mt-16" />

      <Section
        id="logo"
        index="01"
        title="Logo"
        description={
          <p>
            One ribbon folded into an &ldquo;S&rdquo;, beside a Plus Jakarta Sans wordmark whose i
            carries an electric-blue dot. Both parts are SVG, so the lockup is identical at every
            size, before web fonts load and in forced-colours mode. Use the navy wordmark on white
            and the inverse on navy or brand colour.
          </p>
        }
      >
        <Specimen
          name="Lockup"
          api='<Logo size="xs | sm | md | lg | xl | {px}" className="text-*">'
          description="The mark is 1.4 times the wordmark's size and centres on its capitals. The whole lockup is one image named Storevia."
        >
          <div className="flex justify-center py-10 sm:py-16">
            <Logo className="text-[30px] sm:text-[52px]" />
          </div>
        </Specimen>

        <Specimen
          name="Variants"
          api='variant="default | inverse | admin" · tag · monogramOnly'
          description="Inverse keeps the mark and turns the wordmark white. A tag marks internal tools; the monogram serves favicons, avatars and tight headers."
          stage="none"
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <Tile name="Default" code='variant="default"'>
              <Logo size="lg" />
            </Tile>
            <Tile name="Inverse" code='variant="inverse"' tone="navy">
              <Logo size="lg" variant="inverse" />
            </Tile>
            <Tile name="Admin" code='variant="admin" tag="Platform admin"'>
              <Logo variant="admin" tag="Platform admin" />
            </Tile>
            <Tile name="Monogram" code="monogramOnly · <LogoMark size={48 | 24 | 16}>">
              <div className="flex items-end gap-6">
                <Logo size="lg" monogramOnly />
                <LogoMark size={48} />
                <LogoMark size={24} />
                <LogoMark size={16} />
              </div>
            </Tile>
          </div>
        </Specimen>

        <Specimen
          name="Scale"
          api='size="xs" … size="xl" · size={markHeightPx}'
          description="Five named steps, from a 14 px to a 36 px wordmark. A number sets the mark's height in px; a text-* class on the logo also scales it."
          stage="none"
        >
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {LOGO_SIZES.map(([size, note]) => (
              <li
                key={size}
                className="flex flex-col items-start gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <Logo size={size} />
                <code className="font-mono text-caption text-ink-faint">
                  size=&quot;{size}&quot; · {note}
                </code>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen
          name="Construction"
          api="<LogoMark size={px} label? idPrefix?>"
          description="Three equal bands. The top and bottom rise at 1 in 6 and the middle falls, so each gap narrows to its fold. Folds are concentric with their bands and meet them tangentially; both free ends are cut vertically. One gradient runs across the whole ribbon, so nothing changes colour at a fold."
          stage="subtle"
        >
          <div className="grid items-center gap-10 sm:grid-cols-[minmax(0,1fr)_auto]">
            <MarkConstruction />
            <dl className="space-y-3 text-body-sm text-ink-muted sm:max-w-56">
              <div>
                <dt className="text-label text-ink">Slant</dt>
                <dd>1 in 6 (about 9.5°), shared by the glyphs and illustrations.</dd>
              </div>
              <div>
                <dt className="text-label text-ink">Bands</dt>
                <dd>Equal width; each fold keeps a small, visible counter.</dd>
              </div>
              <div>
                <dt className="text-label text-ink">Colour</dt>
                <dd>
                  Deep blue to sky, light blue to deep, then violet, which passes into the right
                  fold.
                </dd>
              </div>
            </dl>
          </div>
        </Specimen>

        <Specimen
          name="Wordmark"
          api="the i's dot at 14–40 px"
          description="Outlined from Plus Jakarta Sans 700 with −0.02em tracking. The dot is an SVG circle, so it stays put at every size and survives forced colours."
        >
          <div className="grid grid-cols-1 items-end gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
            {[14, 16, 20, 24, 32, 40].map((px) => (
              <div key={px} className="flex flex-col items-start gap-2">
                {/* A numeric size is the mark height: 1.4 × the wordmark size. */}
                <Logo size={px * 1.4} />
                <code className="font-mono text-caption text-ink-faint">{px} px wordmark</code>
              </div>
            ))}
          </div>
        </Specimen>

        <Specimen
          name="Clear space and minimum size"
          api="x = half the mark's height"
          description="Keep half the mark's height clear on every side. The lockup's minimum is a 14 px wordmark; below that, and for favicons and avatars, use the mark alone, from 16 px."
        >
          <div className="grid items-center gap-10 sm:grid-cols-2">
            <div className="flex justify-center">
              {/* Mark 48 px tall, so x is 24 px on every side. */}
              <div className="relative p-6 outline-1 -outline-offset-1 outline-brand-300 outline-dashed">
                {(
                  [
                    "inset-x-6 top-0 h-6",
                    "inset-y-6 left-0 w-6",
                    "inset-x-6 bottom-0 h-6",
                    "inset-y-6 right-0 w-6",
                  ] as const
                ).map((place) => (
                  <span
                    key={place}
                    aria-hidden="true"
                    className={`absolute flex items-center justify-center font-mono text-caption text-brand-700 ${place}`}
                  >
                    x
                  </span>
                ))}
                <Logo size={48} className="outline-1 outline-brand-200" />
              </div>
            </div>
            <div className="flex items-end justify-center gap-8">
              {([16, 20, 28] as const).map((px) => (
                <div key={px} className="flex flex-col items-center gap-3">
                  <LogoMark size={px} />
                  <code className="font-mono text-caption text-ink-faint">{px} px</code>
                </div>
              ))}
            </div>
          </div>
        </Specimen>

        <Specimen
          name="Colour"
          api="logo-only values"
          description="These values belong to the logo. Interface colour always comes from the brand and accent ramps."
          stage="none"
        >
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
            {MARK_COLOURS.map(([hex, label]) => (
              <li key={hex} className="min-w-0">
                <span
                  className="block h-14 rounded-control shadow-inset"
                  style={{ background: hex }}
                />
                <span className="mt-2 block text-label text-ink">{label}</span>
                <code className="font-mono text-caption text-ink-faint">{hex}</code>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen
          name="Don’t"
          api="misuse"
          description="The recreation stands in for the official vector until it is supplied; the rules hold for both."
        >
          <ul className="space-y-3 text-body-sm text-ink-muted">
            {DONTS.map((rule) => (
              <li key={rule} className="flex gap-3">
                <Icon icon={X} size="sm" className="mt-0.5 text-danger-600" />
                {rule}
              </li>
            ))}
          </ul>
        </Specimen>
      </Section>

      <Section
        id="icons"
        index="02"
        title="Interface icons"
        description={
          <p>
            Lucide, always through <Code>&lt;Icon&gt;</Code>. Five sizes; the stroke is 1.75 up to
            24 px and 1.5 at 32 px, so every size keeps the same optical weight. Decorative unless
            given a label.
          </p>
        }
      >
        <Specimen
          name="Sizes"
          api='<Icon icon={…} size="sm | nav | md | lg | xl" label?>'
          description="16, 18 (navigation), 20, 24 and 32 px. Numbers work too."
          stage="none"
        >
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {ICON_RAMP.map(([size, px, stroke]) => (
              <li
                key={size}
                className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 sm:px-6"
              >
                <div className="flex w-40 items-center gap-4 text-ink">
                  <Icon icon={House} size={size} />
                  <Icon icon={Store} size={size} />
                  <Icon icon={ChartLine} size={size} />
                  <Icon icon={Users} size={size} />
                </div>
                <code className="font-mono text-caption text-ink-faint">
                  size=&quot;{size}&quot; · {px} · stroke {stroke}
                </code>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen
          name="In context"
          api="nav 18 px · ink-muted · active in brand"
          description="Navigation pairs an 18 px icon with its label. The current item is the only one in brand colour."
        >
          <div className="flex flex-wrap items-center gap-2">
            {NAV_EXAMPLE.map(([icon, label, active]) => (
              <span
                key={label}
                className={`inline-flex h-9 items-center gap-2 rounded-control px-3 text-label ${
                  active ? "bg-brand-50 text-brand-700" : "text-ink-muted"
                }`}
              >
                <Icon icon={icon} size="nav" />
                {label}
              </span>
            ))}
          </div>
        </Specimen>
      </Section>

      <Section
        id="glyphs"
        index="03"
        title="Product glyphs"
        description={
          <p>
            Storevia&rsquo;s own concepts, built from the mark rather than borrowed pictograms:
            bands at its slant, round folds and flat cuts, on a 24 grid with a 1.5 stroke, flat caps
            and mitred corners. The line takes the text colour; exactly one ribbon piece takes the
            accent.
          </p>
        }
      >
        <Specimen
          name="Grammar"
          api="LOGO_SLANT = 1 / 6"
          description="Every diagonal runs at the mark's slant. Bands are strips cut vertically, folds are U-turns, containers are rounded rectangles. One of those pieces carries the accent."
          stage="none"
        >
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
            {PRIMITIVES.map(([name, note, line, accent]) => (
              <li key={name} className="bg-surface px-5 pt-6 pb-5 text-ink">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  strokeWidth="1.5"
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                  className="size-12"
                >
                  {line ? (
                    <path
                      d={line}
                      className={name === "Slant" ? "stroke-neutral-300" : "stroke-current"}
                    />
                  ) : null}
                  <path d={accent} className="stroke-brand-500" />
                </svg>
                <p className="mt-4 text-label text-ink">{name}</p>
                <p className="mt-0.5 text-caption text-ink-faint">{note}</p>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen
          name="Catalogue"
          api='<Glyph name="…" accent? label?>'
          description="Fifteen concepts. The older names still work as aliases, so stored content keeps rendering."
          stage="none"
        >
          <ul className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-5">
            {CANONICAL.map((name) => (
              <li
                key={name}
                className="flex flex-col items-center gap-3 bg-surface px-2 pt-7 pb-4 text-ink"
              >
                <Glyph name={name} className="size-10" />
                <code className="font-mono text-caption text-ink-faint">{name}</code>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-caption text-ink-faint">
            Aliases:{" "}
            {Object.entries(ALIASES).map(([alias, target], i) => (
              <span key={alias}>
                {i > 0 ? " · " : null}
                <code className="font-mono">{alias}</code> →{" "}
                <code className="font-mono">{target}</code>
              </span>
            ))}
          </p>
        </Specimen>

        <Specimen
          name="Accent"
          api='accent="brand | violet | none"'
          description="Brand by default. Violet for rare secondary moments; none draws the glyph in one colour, for example on a coloured surface."
        >
          <div className="grid gap-6">
            {(["brand", "violet", "none"] as const).map((accent) => (
              <div key={accent} className="flex flex-wrap items-center gap-x-8 gap-y-4">
                <code className="w-14 font-mono text-caption text-ink-faint">{accent}</code>
                <div className="flex flex-wrap items-center gap-6 text-ink">
                  {ACCENT_SAMPLE.map((name) => (
                    <Glyph key={name} name={name} accent={accent} className="size-8" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Specimen>

        <Specimen
          name="Sizes"
          api='className="size-5 | size-6 | size-8 | size-12"'
          description="Drawn for 24 px and crisp from 20 px; they scale up for headlines."
        >
          <div className="grid gap-6">
            {(["analytics", "teams"] as const).map((name) => (
              <div key={name} className="flex flex-wrap items-end gap-x-8 gap-y-4 text-ink">
                {(
                  [
                    ["size-5", "20"],
                    ["size-6", "24"],
                    ["size-8", "32"],
                    ["size-12", "48"],
                  ] as const
                ).map(([cls, px]) => (
                  <div key={px} className="flex flex-col items-center gap-2">
                    <Glyph name={name} className={cls} />
                    <code className="font-mono text-caption text-ink-faint">{px}</code>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Specimen>
      </Section>

      <Section
        id="glyph-tiles"
        index="04"
        title="Glyph tiles"
        description={
          <p>
            The standard way to headline a product concept: the glyph on a soft tile with an inset
            hairline. Brand by default; violet only for rare secondary moments.
          </p>
        }
      >
        <Specimen
          name="Tones and sizes"
          api='<GlyphTile name tone="brand | accent | neutral" size="sm | md | lg | xl" label?>'
          description="36, 44, 56 and 64 px tiles. Neutral sits quietly in lists of features."
          stage="none"
        >
          <figure className="overflow-x-auto rounded-panel border border-line bg-surface">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="py-3 pr-2 pl-4 text-caption font-normal text-ink-faint sm:pl-6"
                  >
                    tone
                  </th>
                  {TILE_SIZES.map((size) => (
                    <th
                      key={size}
                      scope="col"
                      className="px-1.5 py-3 text-caption font-normal text-ink-faint sm:px-3"
                    >
                      {size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {TILE_TONES.map(([tone, glyph]) => (
                  <tr key={tone}>
                    <th
                      scope="row"
                      className="py-5 pr-2 pl-4 text-label font-medium text-ink sm:pl-6"
                    >
                      {tone}
                    </th>
                    {TILE_SIZES.map((size) => (
                      <td key={size} className="px-1.5 py-5 sm:px-3">
                        <GlyphTile name={glyph} tone={tone} size={size} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
        </Specimen>
      </Section>

      <Section
        id="illustrations"
        index="05"
        title="Illustrations"
        description={
          <p>
            Empty states and status moments at 96–120 px, in the glyph grammar: navy line, one
            accent piece with its pale tint, white paper, and pale grey ghosts for what
            doesn&rsquo;t exist yet. Every stroke is 1.5 px at any size.
          </p>
        }
      >
        <Specimen
          name="Empty states"
          api='<Illustration name="empty-…" size="sm | md | lg | {px}" accent? label?>'
          description="One per empty list. Each builds its subject from bands, folds and cuts: a receipt cut at the slant, blank tags, a globe with its ribbon orbit."
          stage="none"
        >
          <IllustrationGrid names={EMPTY_STATES} />
        </Specimen>

        <Specimen
          name="Status moments"
          api='name="setup-complete | locked-feature | error | not-found"'
          description="A checklist with its progress band full, a lock whose shackle is a fold, the integrations glyph unhooked, and a signpost at the mark's alternating slants."
          stage="none"
        >
          <IllustrationGrid names={STATUS_MOMENTS} columns="sm:grid-cols-2 xl:grid-cols-4" />
        </Specimen>

        <Specimen
          name="Size and accent"
          api='size="sm" · accent="violet"'
          description="96 px for compact empty states inside cards and tables; violet for a rare secondary voice."
        >
          <div className="flex flex-wrap items-end justify-center gap-x-12 gap-y-8">
            <div className="flex flex-col items-center gap-3">
              <Illustration name="empty-orders" size="sm" />
              <code className="font-mono text-caption text-ink-faint">size=&quot;sm&quot;</code>
            </div>
            <div className="flex flex-col items-center gap-3">
              <Illustration name="setup-complete" />
              <code className="font-mono text-caption text-ink-faint">md, the default</code>
            </div>
            <div className="flex flex-col items-center gap-3">
              <Illustration name="setup-complete" accent="violet" />
              <code className="font-mono text-caption text-ink-faint">
                accent=&quot;violet&quot;
              </code>
            </div>
          </div>
        </Specimen>
      </Section>

      <Section
        id="scenes"
        index="06"
        title="Business scenes"
        description={
          <p>
            Small compositions for Storevia&rsquo;s business types, used in onboarding and on the
            solutions pages. They take the domain&rsquo;s BusinessType values as well as the artwork
            keys.
          </p>
        }
      >
        <Specimen
          name="Business types"
          api='<BusinessScene type="online-store | business-website | publication | portfolio | ECOMMERCE | …" accent? label?>'
          description="A shopfront under a flat awning band, a site with its hero band, an open magazine at alternating slants, and a masonry of work."
          stage="none"
        >
          <SceneGrid types={DOMAIN_SCENES} />
        </Specimen>

        <Specimen
          name="Roadmap"
          api='type="retail-outlet"'
          description="In-person retail is not a business type yet. Its scene is ready: a counter with a card terminal printing a receipt, and a bag."
          stage="none"
        >
          <SceneGrid types={["retail-outlet"]} />
        </Specimen>
      </Section>
    </div>
  );
}
