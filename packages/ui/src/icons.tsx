// Storevia iconography and the logo (docs/design/design-plan.md §6).
//
// - <Icon>: every interface icon is Lucide, rendered through this wrapper so
//   sizes and strokes stay on one scale (16 / 18 / 20 / 24 / 32).
// - <Glyph>: Storevia product glyphs, built from the mark's ribbon (bands at
//   its slant, round folds, flat cut ends) with one accent piece.
// - <Logo> / <LogoMark>: the ribbon "S" and the wordmark. They live here, not
//   in brand.tsx, so the "@storevia/ui/icons" subpath keeps exporting them.
//
// Server-safe: no effects or browser APIs. LogoMark takes its gradient ids
// from useId (allowed in server components) unless it is given an idPrefix.
import type { LucideIcon, LucideProps } from "lucide-react";
import { useId, type CSSProperties, type SVGProps } from "react";
import { cn } from "./cn";

/* ----------------------------------------------------------------------------
 * Interface icons
 * ------------------------------------------------------------------------- */

/** Lucide stroke for 14–24 px icons. Also used by apps that render Lucide directly. */
export const ICON_STROKE = 1.75;
// At 32 px a 1.75 stroke reads heavier than the rest of the set; 1.5 keeps
// the optical weight of 1.75 at 24.
const ICON_STROKE_LARGE = 1.5;

// Named steps (existing API) and their pixel sizes. "nav" is the 18 px
// navigation size from the design plan.
const ICON_PX = { xs: 14, sm: 16, nav: 18, md: 20, lg: 24, xl: 32 } as const;
const ICON_CLASS: Record<number, string> = {
  14: "size-3.5",
  16: "size-4",
  18: "size-[18px]",
  20: "size-5",
  24: "size-6",
  32: "size-8",
};

/** Icon size: a named step or its pixel value. */
export type IconSize = keyof typeof ICON_PX | 14 | 16 | 18 | 20 | 24 | 32;

export interface IconProps extends Omit<LucideProps, "ref" | "size"> {
  icon: LucideIcon;
  /** Default "sm" (16 px). */
  size?: IconSize;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  label?: string;
}

function iconPx(size: IconSize): number {
  return typeof size === "number" ? size : ICON_PX[size];
}

/** An interface icon. Decorative by default; pass `label` when it carries meaning alone. */
export function Icon({
  icon: Component,
  size = "sm",
  label,
  className,
  strokeWidth,
  ...props
}: IconProps) {
  const px = iconPx(size);
  return (
    <Component
      strokeWidth={strokeWidth ?? (px >= 32 ? ICON_STROKE_LARGE : ICON_STROKE)}
      className={cn(ICON_CLASS[px], "shrink-0", className)}
      {...props}
      {...(label ? { "aria-label": label, role: "img" } : { "aria-hidden": true })}
    />
  );
}

/** Brand art's accessible name: `label`, or the older `title`. */
interface ArtNameProps {
  label?: string | undefined;
  title?: string | undefined;
}

/** Splits the accessible name from the rest of the props (neither name prop reaches the DOM). */
function splitArtName<T extends ArtNameProps>(
  props: T,
): [name: string | undefined, rest: Omit<T, keyof ArtNameProps>] {
  const { label, title, ...rest }: ArtNameProps = props;
  return [label ?? title, rest as Omit<T, keyof ArtNameProps>];
}

/** role/aria for brand art: named when labelled, otherwise hidden. */
function artA11y(label: string | undefined) {
  return label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
}

/* ----------------------------------------------------------------------------
 * Storevia glyphs
 *
 * Grammar (24 × 24 grid, 1.5 stroke, flat "butt" caps and mitred corners: the
 * ribbon's cut ends):
 * - every diagonal runs at LOGO_SLANT (1 in 6), rising or falling;
 * - a band is a strip between two parallel slanted edges, cut vertically;
 * - a fold is a U-turn: two parallel legs joined by a half circle;
 * - containers (frames, pages, tiles) are rounded rectangles;
 * - exactly one piece takes the accent colour, and it comes from the ribbon
 *   (a band, a fold or a shape cut at the slant); everything else is
 *   currentColor.
 * ------------------------------------------------------------------------- */

/** The ribbon's slant: 1 in 6 (about 9.5°). The mark, glyphs and illustrations share it. */
export const LOGO_SLANT = 1 / 6;
const SLANT_COS = Math.cos(Math.atan(LOGO_SLANT));
const SLANT_SIN = Math.sin(Math.atan(LOGO_SLANT));

/** Path data from commands and numbers (numbers rounded to 2 decimals). */
function path(...parts: (string | number)[]): string {
  return parts
    .map((p) => (typeof p === "number" ? String(Math.round(p * 100) / 100) : p))
    .join(" ");
}
/** Rounded rectangle as path data. */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  const iw = w - 2 * r;
  const ih = h - 2 * r;
  const arc = (dx: number, dy: number) => ["a", r, r, 0, 0, 1, dx, dy];
  return path(
    "M",
    x + r,
    y,
    "h",
    iw,
    ...arc(r, r),
    "v",
    ih,
    ...arc(-r, r),
    "h",
    -iw,
    ...arc(-r, -r),
    "v",
    -ih,
    ...arc(r, -r),
    "z",
  );
}
/** Circle as path data. */
function circle(cx: number, cy: number, r: number): string {
  return path("M", cx - r, cy, "a", r, r, 0, 1, 0, 2 * r, 0, "a", r, r, 0, 1, 0, -2 * r, 0, "z");
}
/** y of a rising slanted edge through (x0, y0), at x. */
const slantY = (x0: number, y0: number, x: number) => y0 - (x - x0) * LOGO_SLANT;
/** Band from x1 to x2, top edge starting at (x1, y), h tall, rising (/) or falling (\). */
function band(x1: number, x2: number, y: number, h: number, dir: 1 | -1 = 1): string {
  const y2 = y - dir * (x2 - x1) * LOGO_SLANT;
  return path("M", x1, y, "L", x2, y2, "V", y2 + h, "L", x1, y + h, "Z");
}
/** A point `along` the rising slant and `across` it from (cx, cy). */
function onSlant(cx: number, cy: number, along: number, across: number): [number, number] {
  return [cx + along * SLANT_COS + across * SLANT_SIN, cy - along * SLANT_SIN + across * SLANT_COS];
}
/** Fold: legs `gap` apart and `length` long, joined by a half circle centred on (cx, cy). */
function fold(cx: number, cy: number, gap: number, length: number, opens: "left" | "right") {
  const r = gap / 2;
  const s = opens === "right" ? 1 : -1;
  return path(
    "M",
    ...onSlant(cx, cy, s * length, -r),
    "L",
    ...onSlant(cx, cy, 0, -r),
    "A",
    r,
    r,
    0,
    0,
    opens === "right" ? 0 : 1,
    ...onSlant(cx, cy, 0, r),
    "L",
    ...onSlant(cx, cy, s * length, r),
  );
}
/** Tag: a band with a round (folded) end centred on (cx, cy) and a flat cut at x = cut. */
function tag(cx: number, cy: number, r: number, cut: number): string {
  const top = onSlant(cx, cy, 0, -r);
  const bottom = onSlant(cx, cy, 0, r);
  return path(
    "M",
    ...top,
    "L",
    cut,
    slantY(...top, cut),
    "V",
    slantY(...bottom, cut),
    "L",
    ...bottom,
    "A",
    r,
    r,
    0,
    0,
    1,
    ...top,
    "Z",
  );
}

interface GlyphArt {
  /** currentColor strokes. */
  readonly line: string;
  /** The single accent piece: a band, a fold or a shape cut at the slant. */
  readonly accent: string;
}

// Shop awning: its lower edge is where the walls start.
const AWNING = { x1: 3, x2: 21, y: 8.5, h: 3.5 } as const;
const awningFoot = (x: number) => slantY(AWNING.x1, AWNING.y + AWNING.h, x);
// Type tool: the stem meets the crossbar's lower edge.
const CROSSBAR = { x1: 4, x2: 20, y: 7, h: 3.5 } as const;
const crossbarFoot = (x: number) => slantY(CROSSBAR.x1, CROSSBAR.y + CROSSBAR.h, x);

const GLYPH_ART = {
  // A browser frame; the hero is a band.
  website: {
    line: `${rr(3, 4, 18, 16, 2.5)}M3 8.5h18`,
    accent: band(6.5, 17.5, 13.5, 4),
  },
  // A shopfront under a flat, slanted awning band.
  "online-store": {
    line: path("M3 20.5h18M5", awningFoot(5), "V20.5M19", awningFoot(19), "V20.5M10 20.5V16h4v4.5"),
    accent: band(AWNING.x1, AWNING.x2, AWNING.y, AWNING.h),
  },
  // A price tag: a band with a folded end, an eyelet and a flat cut.
  commerce: {
    line: circle(8.6, 12.4, 1.25),
    accent: tag(8.6, 12.4, 4.5, 21),
  },
  // An open book; the right-hand page is a band.
  publishing: {
    line: "M12 7.5V20M12 7.5 3 6v12.5l9 1.5",
    accent: "M12 7.5 21 6v12.5L12 20",
  },
  // A masonry of work, split by gaps at alternating slants like the mark.
  portfolio: {
    line:
      "M13 9v10.5a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5-1.5v-9.17z" +
      "M13 7V4.5A1.5 1.5 0 0 1 14.5 3h5A1.5 1.5 0 0 1 21 4.5v3.83z" +
      "M3 15.33v4.17A1.5 1.5 0 0 0 4.5 21h5a1.5 1.5 0 0 0 1.5-1.5V14z",
    accent: "M3 13.33V4.5A1.5 1.5 0 0 1 4.5 3h5A1.5 1.5 0 0 1 11 4.5V12z",
  },
  // Three bars cut at the slant; the tallest carries the accent.
  analytics: {
    line: path(
      "M3 20.5h18M4.5 20.5V14.5L8.5",
      slantY(4.5, 14.5, 8.5),
      "V20.5M10 20.5V10.5L14",
      slantY(10, 10.5, 14),
      "V20.5",
    ),
    accent: path("M15.5 20.5V5.5L19.5", slantY(15.5, 5.5, 19.5), "V20.5"),
  },
  // Two people; their shoulders are folds.
  teams: {
    line: circle(7.25, 7.75, 2.75) + circle(16.75, 7.75, 2.75),
    accent: "M3.5 20.5v-4a3.75 3.75 0 0 1 7.5 0v4M13 20.5v-4a3.75 3.75 0 0 1 7.5 0v4",
  },
  // A globe with a ribbon orbit.
  domains: {
    line: `${circle(12, 12, 8)}M12 4c-2.3 2.3-3.4 5-3.4 8s1.1 5.7 3.4 8c2.3-2.3 3.4-5 3.4-8S14.3 6.3 12 4z`,
    accent: band(1.75, 22.25, 13.9, 3),
  },
  // A paint roller whose head is a band.
  themes: {
    line: `M17 7.5h2.5A1.5 1.5 0 0 1 21 9v2a1.5 1.5 0 0 1-1.5 1.5H12v3${rr(10.5, 15.5, 3, 6, 1)}`,
    accent: band(3, 17, 5.5, 4.5),
  },
  // Two folds hooked through each other.
  integrations: {
    line: fold(7.25, 12.6, 6.5, 8.75, "right"),
    accent: fold(16.75, 14.4, 6.5, 8.75, "left"),
  },
  // A card terminal printing a receipt: a strip cut at the slant.
  retail: {
    line: `${rr(5, 9, 14, 12, 2.5)}${rr(8, 12, 8, 3.5, 1)}M9 18h1.5M11.25 18h1.5M13.5 18h1.5`,
    accent: path(
      "M8 9V",
      slantY(8, 4.17, 8),
      "L16",
      slantY(8, 4.17, 16),
      "V9M10.25",
      slantY(8, 6.33, 10.25),
      "L13.75",
      slantY(8, 6.33, 13.75),
    ),
  },
  // Layout blocks; the block being placed is a band.
  builder: {
    line: rr(3, 3, 18, 5, 1.5) + rr(3, 10, 7, 11, 1.5),
    accent: band(12.5, 21, 12.5, 7.5),
  },
  // The type tool: a band crossbar on a stem.
  content: {
    line: path("M10.5", crossbarFoot(10.5), "V20.5h3V", crossbarFoot(13.5)),
    accent: band(CROSSBAR.x1, CROSSBAR.x2, CROSSBAR.y, CROSSBAR.h),
  },
  // A receipt cut at the slant; the total is a band.
  orders: {
    line: path("M6 3h12v15.5L6", slantY(18, 18.5, 6), "zM9 7h6M9 10h6"),
    accent: band(8.5, 15.5, 13.2, 3),
  },
  // A picture: the horizon runs at the slant.
  media: {
    line: rr(3, 4, 18, 16, 2.5) + circle(8.5, 9.5, 1.75),
    accent: path("M3 17L21", slantY(3, 17, 21)),
  },
} as const satisfies Record<string, GlyphArt>;

// Earlier names stay valid (apps store them in content and business-type maps).
const GLYPH_ALIASES = {
  "business-website": "website",
  publication: "publishing",
  "retail-outlet": "retail",
  store: "online-store",
} as const satisfies Record<string, keyof typeof GLYPH_ART>;

export type GlyphName = keyof typeof GLYPH_ART | keyof typeof GLYPH_ALIASES;

/** Every glyph name, canonical names first (galleries and tests). */
export const GLYPH_NAMES = [
  ...(Object.keys(GLYPH_ART) as (keyof typeof GLYPH_ART)[]),
  ...(Object.keys(GLYPH_ALIASES) as (keyof typeof GLYPH_ALIASES)[]),
] as readonly GlyphName[];

function glyphArt(name: GlyphName): GlyphArt {
  return name in GLYPH_ALIASES
    ? GLYPH_ART[GLYPH_ALIASES[name as keyof typeof GLYPH_ALIASES]]
    : GLYPH_ART[name as keyof typeof GLYPH_ART];
}

/** The accent piece's colour. "none" draws the glyph in one colour. */
export type GlyphAccent = "brand" | "violet" | "none";

const GLYPH_ACCENT: Record<GlyphAccent, string> = {
  brand: "[--glyph-accent:var(--color-brand-500)]",
  violet: "[--glyph-accent:var(--color-accent-500)]",
  none: "[--glyph-accent:currentColor]",
};

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, "name" | "children"> {
  name: GlyphName;
  /** Accent colour (default brand). Callers may also set `--glyph-accent` via className. */
  accent?: GlyphAccent;
  /** Accessible name. Without it the glyph is decorative. */
  label?: string;
  /** @deprecated Use `label`. */
  title?: string;
}

/** A Storevia product glyph (24 grid). Line in currentColor, one accent piece. */
export function Glyph({ name, accent = "brand", className, ...others }: GlyphProps) {
  const art = glyphArt(name);
  const [name_, props] = splitArtName(others);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      data-glyph={name}
      className={cn("size-6 shrink-0", GLYPH_ACCENT[accent], className)}
      {...artA11y(name_)}
      {...props}
    >
      {name_ ? <title>{name_}</title> : null}
      <path d={art.line} />
      <path d={art.accent} className="stroke-(--glyph-accent)" />
    </svg>
  );
}

export type GlyphTileTone = "brand" | "accent" | "neutral";
export type GlyphTileSize = "sm" | "md" | "lg" | "xl";

export interface GlyphTileProps {
  name: GlyphName;
  /** brand (default): blue tile; accent: the rare violet voice; neutral: quiet grey. */
  tone?: GlyphTileTone;
  size?: GlyphTileSize;
  className?: string;
  /** Accessible name. Without it the tile is decorative. */
  label?: string;
  /** @deprecated Use `label`. */
  title?: string;
}

const TILE_TONE: Record<GlyphTileTone, { box: string; accent: GlyphAccent; glyph: string }> = {
  brand: {
    box: "bg-brand-50 ring-brand-100",
    accent: "brand",
    glyph: "[--glyph-accent:var(--color-brand-600)]",
  },
  accent: {
    box: "bg-accent-50 ring-accent-100",
    accent: "violet",
    glyph: "[--glyph-accent:var(--color-accent-600)]",
  },
  neutral: { box: "bg-subtle ring-line", accent: "brand", glyph: "" },
};

const TILE_SIZE: Record<GlyphTileSize, { box: string; glyph: string }> = {
  sm: { box: "size-9 rounded-control", glyph: "size-5" },
  md: { box: "size-11 rounded-card", glyph: "size-6" },
  lg: { box: "size-14 rounded-card", glyph: "size-7" },
  xl: { box: "size-16 rounded-panel", glyph: "size-8" },
};

/** A glyph on a soft tile: the standard way to headline a product concept. */
export function GlyphTile({
  name,
  tone = "brand",
  size = "md",
  className,
  ...names
}: GlyphTileProps) {
  const t = TILE_TONE[tone];
  const s = TILE_SIZE[size];
  const [name_] = splitArtName(names);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-ink ring-1 ring-inset",
        s.box,
        t.box,
        className,
      )}
      {...(name_ ? { role: "img", "aria-label": name_ } : {})}
    >
      <Glyph name={name} accent={t.accent} className={cn(s.glyph, t.glyph)} />
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Logo
 *
 * An inline recreation of the Storevia ribbon "S" (design-plan §6): one
 * ribbon folded twice. The top and bottom bands rise at LOGO_SLANT and the
 * middle band falls, so each gap is a wedge that narrows to the fold joining
 * its bands. The folds are concentric arcs tangent to their bands (band
 * width 20.4, counter radius 4.6), and both ends are cut vertically.
 *
 * Paint: one gradient across the whole ribbon, so nothing changes colour at a
 * fold, plus three sheens that fade to nothing wherever they meet unpainted
 * ribbon: cyan towards the top cut, light blue along the middle band and into
 * the left fold, violet towards the bottom cut. The blue-to-violet run of the
 * base through the right fold is the translucent overlap.
 *
 * The official vector can be dropped in here to replace this recreation: keep
 * the 100 × 114 viewBox (or update LOGO_MARK_RATIO) and per-instance ids.
 * ------------------------------------------------------------------------- */

/** Mark width ÷ height. */
const LOGO_MARK_RATIO = 100 / 114;

const MARK = {
  ribbon:
    "M100 0L20.88 13.19A24.99 24.99 0 0 0 20.88 62.48L75.77 71.63A4.6 4.6 0 0 1 75.77 80.7" +
    "L0 93.33L0 114L79.12 100.81A24.99 24.99 0 0 0 79.12 51.52L24.23 42.37" +
    "A4.6 4.6 0 0 1 24.23 33.3L100 20.67Z",
  top: "M20.88 13.19L100 0L100 20.67L24.23 33.3Z",
  bottom: "M79.12 100.81L75.77 80.7L0 93.33L0 114Z",
} as const;

type Stop = readonly [offset: number, color: string, opacity?: number];
interface MarkGradient {
  readonly key: string;
  /** x1, y1, x2, y2 in viewBox units. */
  readonly line: readonly [number, number, number, number];
  readonly stops: readonly Stop[];
}

// The base runs across the middle band; the sheens run along their bands.
const MARK_GRADIENTS: readonly MarkGradient[] = [
  {
    key: "base",
    line: [59.7, -1.2, 40.3, 115.2],
    stops: [
      [0, "#1F3BE8"],
      [0.517, "#1F3BE8"],
      [0.603, "#1A3BD9"],
      [0.841, "#6E6BFF"],
      [1, "#6E6BFF"],
    ],
  },
  {
    key: "top",
    line: [22.55, 23.24, 103.95, 9.68],
    stops: [
      [0, "#29C5FF", 0],
      [0.4, "#29C5FF", 0.2],
      [1, "#29C5FF", 1],
    ],
  },
  {
    key: "mid",
    line: [22.55, 52.42, 77.45, 61.57],
    stops: [
      [0, "#4FA8FF", 0.95],
      [0.3, "#4FA8FF", 0.72],
      [0.8, "#4FA8FF", 0],
    ],
  },
  {
    key: "bottom",
    line: [77.45, 90.76, -3.95, 104.32],
    stops: [
      [0, "#9B6BFF", 0],
      [0.45, "#9B6BFF", 0.3],
      [1, "#9B6BFF", 1],
    ],
  },
  // Mask for the middle sheen: clear over the top band and the top of the
  // left fold, opaque over the middle band.
  {
    key: "mask",
    line: [59.7, -1.2, 40.3, 115.2],
    stops: [
      [0.261, "#FFFFFF", 0],
      [0.422, "#FFFFFF", 1],
      [0.603, "#FFFFFF", 1],
      [0.654, "#FFFFFF", 0],
    ],
  },
];

/** Stable, selector-safe id prefix for one mark instance. */
function useMarkId(): string {
  return `sv-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export interface LogoMarkProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Height in px. Without it the mark is 32 px tall unless className sizes it. */
  size?: number;
  /** Accessible name. Without it the mark is decorative (use inside a labelled link or Logo). */
  label?: string;
  /** @deprecated Use `label`. */
  title?: string;
  /**
   * Prefix for the mark's gradient and mask ids; must be unique on the page.
   * With it no hook runs, so the mark also renders outside a React render
   * (next/og's ImageResponse, a favicon script). Without it useId supplies one.
   */
  idPrefix?: string | undefined;
}

/** The ribbon "S" on its own: favicons, avatars, compact headers. */
export function LogoMark({ idPrefix, ...props }: LogoMarkProps) {
  return idPrefix ? <LogoMarkArt prefix={idPrefix} {...props} /> : <LogoMarkWithId {...props} />;
}

function LogoMarkWithId(props: Omit<LogoMarkProps, "idPrefix">) {
  return <LogoMarkArt prefix={useMarkId()} {...props} />;
}

function LogoMarkArt({
  prefix,
  size,
  className,
  ...others
}: Omit<LogoMarkProps, "idPrefix"> & { prefix: string }) {
  const url = (key: string) => `url(#${prefix}-${key})`;
  const [name, props] = splitArtName(others);
  return (
    <svg
      viewBox="0 0 100 114"
      {...(size !== undefined
        ? { width: Math.round(size * LOGO_MARK_RATIO * 100) / 100, height: size }
        : {})}
      className={cn(size === undefined && "h-8 w-auto", "shrink-0", className)}
      focusable="false"
      {...artA11y(name)}
      {...props}
    >
      {name ? <title>{name}</title> : null}
      <defs>
        {MARK_GRADIENTS.map(({ key, line: [x1, y1, x2, y2], stops }) => (
          <linearGradient
            key={key}
            id={`${prefix}-${key}`}
            gradientUnits="userSpaceOnUse"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          >
            {stops.map(([offset, color, opacity]) => (
              <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
            ))}
          </linearGradient>
        ))}
        <mask id={`${prefix}-fade`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="114">
          <rect width="100" height="114" fill={url("mask")} />
        </mask>
      </defs>
      <path d={MARK.ribbon} fill={url("base")} />
      <path d={MARK.ribbon} fill={url("mid")} mask={url("fade")} />
      <path d={MARK.top} fill={url("top")} />
      <path d={MARK.bottom} fill={url("bottom")} />
    </svg>
  );
}

// "Storevia" in Plus Jakarta Sans 700 with the site's -0.02em tracking,
// outlined from the shipped font (units of 1/1000 em, cropped to the ink:
// cap top to baseline overshoot). The i is its stem; the brand dot replaces
// the tittle at the tittle's centre. Outlines keep the lockup exact at every
// size and independent of font loading.
const WORDMARK = {
  viewBox: "0 0 3842 769",
  dot: { cx: 3217, cy: 82, r: 70 },
  d:
    "M299 769q-70 0-131-26-60-26-104-72-43-47-64-109l113-49" +
    "q28 65 79 101 51 36 115 36 36 0 62-12 26-11 41-31 15-20 15-47 0-34-20-55-19-21-59-34l-143-46" +
    "q-86-27-131-81-44-53-44-127 0-64 32-113 31-49 88-76 56-28 129-28 67 0 123 23 57 24 97 65 40 42 60 98" +
    "l-112 50q-22-55-66-86-44-31-101-31-34 0-61 12-26 11-40 32-14 21-14 48 0 31 20 55 20 24 60 36" +
    "l137 44q90 28 134 79 45 51 45 126 0 64-33 113-33 49-92 77-58 28-135 28z" +
    "M898 763q-93 0-143-51-51-50-51-142v-240h-94v-116h10q40 0 62-22 22-21 22-61v-41h131v124h126v116h-126v233" +
    "q0 28 10 47 9 19 30 28 21 10 52 10 7 0 17-1 9-1 19-2v112q-14 2-32 4-18 2-33 2z" +
    "M1303 769q-80 0-145-37-65-37-104-101-39-64-39-146 0-82 39-146 38-64 104-101 65-36 145-36 80 0 145 36" +
    " 65 37 104 101 38 64 38 146 0 82-39 146-39 65-104 101-64 37-144 37z" +
    "M1303 649q44 0 78-21 34-21 53-58 20-37 20-85 0-47-20-84-19-37-53-58-34-21-78-21-44 0-78 21-34 21-54 58" +
    "-20 37-20 84 0 48 20 85 20 37 54 58 34 21 78 21z" +
    "M1669 757v-543h124v120l-10-18q18-61 59-85 41-24 97-24h33v117h-47q-56 0-90 34-35 34-35 96v303z" +
    "M2281 769q-84 0-147-38-63-38-98-103-35-64-35-144 0-82 36-145 36-64 97-101 61-36 138-36 63 0 112 20" +
    " 49 21 83 58 34 37 51 85 18 47 18 102 0 15-1 29-2 15-5 27h-420v-100h345l-62 46" +
    "q10-46-4-82-13-36-44-57-31-21-73-21-42 0-74 21-31 21-48 60-16 39-13 95-4 51 14 89 17 38 52 59 34 21 80 21" +
    " 45 0 76-19 31-19 50-50l106 51q-16 39-51 69-34 30-80 47-47 17-103 17z" +
    "M2769 757l-213-543h142l156 427h-53l156-427h142l-214 543z" +
    "M3151 757v-543h131v543z" +
    "M3549 769q-57 0-100-19-42-19-65-54-23-35-23-83 0-45 20-80 21-36 63-60 42-24 105-34l178-29v100l-153 27" +
    "q-38 7-58 24-19 18-19 47 0 28 22 45 21 17 53 17 42 0 73-18 31-18 49-49 17-30 17-67v-141" +
    "q0-35-27-58-27-24-73-24-42 0-74 23-32 23-47 59l-107-52" +
    "q16-43 50-74 34-32 82-50 47-17 102-17 66 0 117 24 51 25 80 68 28 44 28 101v362h-123v-93l28-1" +
    "q-22 34-51 58-29 24-66 36-37 12-81 12z",
} as const;

/** The wordmark in currentColor with the electric-blue dot. Decorative: Logo carries the name. */
function LogoWordmark({ className }: { className?: string }) {
  const { viewBox, dot, d } = WORDMARK;
  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      className={cn(
        // Browsers keep an SVG's own colour in forced-colours mode, so switch
        // the letters to the system text colour explicitly.
        "h-[0.769em] w-[3.842em] shrink-0 fill-current forced-colors:fill-[CanvasText]",
        className,
      )}
    >
      <path d={d} />
      {/* An SVG dot, not a CSS background, so forced-colours mode keeps it. */}
      <circle cx={dot.cx} cy={dot.cy} r={dot.r} fill="#4A67FF" />
    </svg>
  );
}

/** Named lockup sizes (wordmark font size); a number is the mark's height in px. */
export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl" | number;

// The mark is 1.4 × the wordmark's font size; everything below scales in em,
// so a caller's text-* class (e.g. "text-lg") also resizes the lockup.
const LOGO_MARK_EM = 1.4;
const LOGO_TEXT: Record<Exclude<LogoSize, number>, string> = {
  xs: "text-[14px]",
  sm: "text-[16px]",
  md: "text-[19px]",
  lg: "text-[26px]",
  xl: "text-[36px]",
};

export interface LogoProps {
  className?: string;
  /**
   * default: navy wordmark. inverse: white wordmark for dark or brand
   * backgrounds (same mark). admin: default plus a tag (defaults to "Admin").
   */
  variant?: "default" | "inverse" | "admin";
  /** Just the mark (the accessible name stays "Storevia"). */
  monogramOnly?: boolean;
  /** Small pill after the wordmark, e.g. "Platform admin". Works with any variant. */
  tag?: string;
  /** Default "md" (19 px wordmark, 27 px mark). */
  size?: LogoSize;
  /** Gradient id prefix for the mark (see LogoMark). */
  idPrefix?: string;
}

/**
 * The Storevia logo: ribbon mark + wordmark, one image named "Storevia".
 * Both parts are SVG, so the lockup renders the same at every size, with or
 * without web fonts, and in forced-colours mode.
 */
export function Logo({
  className,
  variant = "default",
  monogramOnly = false,
  tag,
  size = "md",
  idPrefix,
}: LogoProps) {
  const inverse = variant === "inverse";
  const tagText = tag ?? (variant === "admin" ? "Admin" : undefined);
  const label = tagText ? `Storevia ${tagText}` : "Storevia";
  const style: CSSProperties | undefined =
    typeof size === "number"
      ? { fontSize: Math.round((size / LOGO_MARK_EM) * 100) / 100 }
      : undefined;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-[0.34em] align-middle leading-none",
        typeof size === "number" ? undefined : LOGO_TEXT[size],
        className,
      )}
      style={style}
    >
      {/* 1.4em tall; the wordmark's box is its ink, so centring aligns the mark on the caps. */}
      <LogoMark idPrefix={idPrefix} className="h-[1.4em] w-[1.228em]" />
      {monogramOnly ? null : <LogoWordmark className={inverse ? "text-white" : "text-navy-900"} />}
      {tagText ? (
        <span
          aria-hidden="true"
          className={cn(
            "ml-[0.2em] inline-flex items-center gap-1.5 rounded-pill border px-2 py-1 font-sans text-[max(0.6875rem,0.58em)] font-medium whitespace-nowrap",
            inverse
              ? "border-white/25 text-white/85"
              : "border-line-strong bg-surface text-ink-muted",
          )}
        >
          {/* The admin marker colour: a tagged lockup always means an internal tool. */}
          <span className="size-1.5 rounded-full bg-admin" />
          {tagText}
        </span>
      ) : null}
    </span>
  );
}
