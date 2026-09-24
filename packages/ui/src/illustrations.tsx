// Storevia illustrations (docs/design/design-plan.md §6): empty states and
// business-type scenes in the glyphs' ribbon grammar at a larger scale:
// bands at the mark's slant, round folds, flat cut ends and rounded
// containers. Navy line; exactly one accent piece (brand, or violet for rare
// moments) with its pale tint; white "paper" and pale neutral "ghost" fills.
//
// Server-safe and decorative: aria-hidden unless given a label. Every stroke
// is 1.5 px at any size (non-scaling), the glyphs' weight.
import type { ReactNode, SVGProps } from "react";
import { cn } from "./cn";
import { LOGO_SLANT } from "./icons";

// Shared paint. The accent comes from CSS variables so a caller can switch the
// one accent voice (brand or violet) without new artwork.
const INK = "fill-none stroke-navy-900";
const PAPER = "fill-white stroke-navy-900";
const GHOST = "fill-neutral-50 stroke-neutral-300";
const SOFT = "fill-none stroke-neutral-300";
const ACCENT = "fill-none stroke-(--illo-accent)";
const ACCENT_TINT = "fill-(--illo-accent-soft) stroke-(--illo-accent)";
// Placeholders for things that don't exist yet.
const DASH = "3 3";

// Forced-colours mode leaves SVG paint alone, so map the palette to system
// colours: navy line on white paper would otherwise vanish on a dark canvas.
const FORCED =
  "forced-colors:[&_.stroke-navy-900]:stroke-[CanvasText] forced-colors:[&_.fill-navy-900]:fill-[CanvasText] forced-colors:[&_.fill-white]:fill-[Canvas] forced-colors:[&_.fill-neutral-50]:fill-[Canvas] forced-colors:[&_.stroke-neutral-300]:stroke-[GrayText] forced-colors:[--illo-accent-soft:Canvas]";

const ACCENTS = {
  brand: "[--illo-accent:var(--color-brand-500)] [--illo-accent-soft:var(--color-brand-50)]",
  violet: "[--illo-accent:var(--color-accent-500)] [--illo-accent-soft:var(--color-accent-50)]",
} as const;

export type IllustrationAccent = keyof typeof ACCENTS;

/* Geometry (the glyph helpers, at artboard scale). */

const SLANT_COS = Math.cos(Math.atan(LOGO_SLANT));
const SLANT_SIN = Math.sin(Math.atan(LOGO_SLANT));

/** Path data from commands and numbers (numbers rounded to 2 decimals). */
function d(...parts: (string | number)[]): string {
  return parts
    .map((p) => (typeof p === "number" ? String(Math.round(p * 100) / 100) : p))
    .join(" ");
}
/** y of a slanted edge through (x0, y0) at x, rising (1) or falling (-1) to the right. */
const slantY = (x0: number, y0: number, x: number, dir: 1 | -1 = 1) =>
  y0 - dir * (x - x0) * LOGO_SLANT;
/** Band from x1 to x2, top edge starting at (x1, y), h tall, cut vertically. */
function band(x1: number, x2: number, y: number, h: number, dir: 1 | -1 = 1): string {
  const y2 = slantY(x1, y, x2, dir);
  return d("M", x1, y, "L", x2, y2, "V", y2 + h, "L", x1, y + h, "Z");
}
/** A point `along` the rising slant and `across` it from (cx, cy). */
function onSlant(cx: number, cy: number, along: number, across: number): [number, number] {
  return [cx + along * SLANT_COS + across * SLANT_SIN, cy - along * SLANT_SIN + across * SLANT_COS];
}
/** Fold: legs `gap` apart and `length` long, joined by a half circle centred on (cx, cy). */
function fold(cx: number, cy: number, gap: number, length: number, opens: "left" | "right") {
  const r = gap / 2;
  const s = opens === "right" ? 1 : -1;
  return d(
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
  return d(
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

type Art = () => ReactNode;

/* ----------------------------------------------------------------------------
 * Empty states and status moments: 120 × 120 artboard.
 * ------------------------------------------------------------------------- */

const ILLUSTRATIONS = {
  // A blank receipt (the orders glyph): the total is still an empty band.
  "empty-orders": () => (
    <>
      <path d={d("M46 12h48v74L46", slantY(94, 86, 46), "z")} className={GHOST} />
      <path d={d("M32 20h50v78L32", slantY(82, 98, 32), "z")} className={PAPER} />
      <path d="M42 34h24M42 44h30M42 54h18" className={SOFT} />
      <path d={band(42, 72, 70, 11)} className={ACCENT_TINT} />
    </>
  ),
  // Blank price tags.
  "empty-products": () => (
    <>
      <path d={tag(34, 48, 14, 92)} className={GHOST} />
      <path d={tag(38, 64, 17, 100)} className={ACCENT_TINT} />
      <circle cx="38" cy="64" r="4.5" className={PAPER} />
    </>
  ),
  // A page with its headline band and a caret on the next, empty line.
  "empty-content": () => (
    <>
      <rect x="30" y="16" width="58" height="88" rx="6" className={PAPER} />
      <path d={band(40, 78, 32, 10)} className={ACCENT_TINT} />
      <path d="M40 58h38M40 68h38M40 78h22" className={SOFT} />
      <path d="M44 84v14M41 84h6M41 98h6" className={INK} />
    </>
  ),
  // Bars cut at the slant, waiting for data.
  "empty-analytics": () => (
    <>
      <rect x="16" y="22" width="88" height="72" rx="6" className={PAPER} />
      <path d="M26 36h22M26 82h68" className={INK} />
      <path d={d("M30 82V66L42", slantY(30, 66, 42), "V82")} className={GHOST} />
      <path d={d("M50 82V58L62", slantY(50, 58, 62), "V82")} className={GHOST} />
      <path
        d={d("M70 82V46L82", slantY(70, 46, 82), "V82")}
        className={ACCENT}
        strokeDasharray={DASH}
      />
    </>
  ),
  // You, and a place for the next person.
  "empty-team": () => (
    <>
      <circle cx="41" cy="44" r="10" className={PAPER} />
      <path d="M25 94V82a16 16 0 0 1 32 0v12" className={ACCENT_TINT} />
      <circle cx="79" cy="44" r="10" className={GHOST} strokeDasharray={DASH} />
      <path d="M63 94V82a16 16 0 0 1 32 0v12" className={GHOST} strokeDasharray={DASH} />
    </>
  ),
  // The globe glyph: a ribbon orbit around the web.
  "empty-domains": () => (
    <>
      <circle cx="60" cy="60" r="28" className={PAPER} />
      <path
        d="M60 32c-8 8-12 17.5-12 28s4 20 12 28c8-8 12-17.5 12-28s-4-20-12-28z"
        className={INK}
      />
      <path d={band(14, 106, 67, 11)} className={ACCENT_TINT} />
    </>
  ),
  // A query with nothing under it.
  "empty-search": () => (
    <>
      <rect x="14" y="14" width="92" height="22" rx="11" className={PAPER} />
      <circle cx="25" cy="25" r="4.5" className={INK} />
      <path d={d("M28.2 28.2L31", slantY(28.2, 28.2, 31, -1))} className={INK} />
      <path d={band(36, 66, 21, 8)} className={ACCENT_TINT} />
      <path d="M72 19v12" className={INK} />
      <rect x="14" y="48" width="92" height="14" rx="5" className={GHOST} strokeDasharray={DASH} />
      <rect x="14" y="70" width="92" height="14" rx="5" className={GHOST} strokeDasharray={DASH} />
      <rect x="14" y="92" width="60" height="14" rx="5" className={GHOST} strokeDasharray={DASH} />
    </>
  ),
  // An empty tray; the slot is a shallow fold.
  "empty-inbox": () => (
    <>
      <rect x="40" y="16" width="40" height="38" rx="5" className={GHOST} strokeDasharray={DASH} />
      <path
        d="M20 64h24a20 20 0 0 0 32 0h24v26a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6z"
        className={PAPER}
      />
      <path d="M44 64a20 20 0 0 0 32 0" className={ACCENT} />
    </>
  ),
  // A timeline with one event so far.
  "empty-activity": () => (
    <>
      <path d="M30 35v61" className={SOFT} />
      <circle cx="30" cy="30" r="5" className={PAPER} />
      <circle cx="30" cy="60" r="4" className={GHOST} />
      <circle cx="30" cy="88" r="4" className={GHOST} />
      <rect x="44" y="20" width="58" height="20" rx="5" className={PAPER} />
      <path d={band(52, 90, 27, 6)} className={ACCENT} />
      <rect x="44" y="50" width="50" height="20" rx="5" className={GHOST} />
      <rect x="44" y="78" width="54" height="20" rx="5" className={GHOST} />
    </>
  ),
  // Every step ticked; the progress band runs the full width.
  "setup-complete": () => (
    <>
      <rect x="24" y="14" width="72" height="84" rx="6" className={PAPER} />
      <path
        d="M34 30a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2zM36.5 33l2 2 3.5-4M34 48a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2zM36.5 51l2 2 3.5-4M34 66a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2zM36.5 69l2 2 3.5-4"
        className={INK}
      />
      <path d="M52 33h32M52 51h26M52 69h30" className={SOFT} />
      <path d={band(34, 86, 84, 6)} className={ACCENT_TINT} />
    </>
  ),
  // A lock whose shackle is a fold.
  "locked-feature": () => (
    <>
      <path d="M46 54V38a14 14 0 0 1 28 0v16" className={ACCENT} />
      <rect x="32" y="54" width="56" height="42" rx="7" className={PAPER} />
      <circle cx="60" cy="71" r="5" className={INK} />
      <path d="M60 76v8" className={INK} />
    </>
  ),
  // The integrations glyph, unhooked.
  error: () => (
    <>
      <path d={fold(26, 62, 22, 24, "right")} className={INK} />
      <path d={fold(94, 58, 22, 24, "left")} className={ACCENT} />
      <path d="M60 40v8M60 72v8" className={SOFT} />
    </>
  ),
  // A signpost; its boards take the mark's alternating slants.
  "not-found": () => (
    <>
      <path d="M60 22v78" className={INK} />
      <path d="M24 100h72" className={SOFT} />
      <path d={band(60, 98, 36, 14)} className={ACCENT_TINT} />
      <path d={band(22, 60, 54, 14, -1)} className={PAPER} />
    </>
  ),
} as const satisfies Record<string, Art>;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

/** Every illustration name (galleries and tests). */
export const ILLUSTRATION_NAMES = Object.keys(ILLUSTRATIONS) as IllustrationName[];

const ILLUSTRATION_PX = { sm: 96, md: 120, lg: 160 } as const;

export interface IllustrationProps extends Omit<SVGProps<SVGSVGElement>, "name" | "children"> {
  name: IllustrationName;
  /** sm 96, md 120 (default), lg 160, or a pixel width. */
  size?: keyof typeof ILLUSTRATION_PX | number;
  /** The one accent voice; violet is for rare, secondary moments. */
  accent?: IllustrationAccent;
  /** Accessible name. Without it the art is decorative (aria-hidden). */
  label?: string;
  /** @deprecated Use `label`. */
  title?: string;
}

/** The art's accessible name: `label`, or the older `title`. */
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

/** role/aria for art: named when labelled, otherwise hidden. */
function a11y(label: string | undefined) {
  return label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
}

/** Empty-state and status illustration (120 × 120 artboard). */
export function Illustration({
  name,
  size = "md",
  accent = "brand",
  className,
  ...others
}: IllustrationProps) {
  const px = typeof size === "number" ? size : ILLUSTRATION_PX[size];
  const Art = ILLUSTRATIONS[name];
  const [name_, props] = splitArtName(others);
  return (
    <svg
      viewBox="0 0 120 120"
      width={px}
      height={px}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      data-illustration={name}
      className={cn(
        "shrink-0 [&_*]:[vector-effect:non-scaling-stroke]",
        FORCED,
        ACCENTS[accent],
        className,
      )}
      {...a11y(name_)}
      {...props}
    >
      {name_ ? <title>{name_}</title> : null}
      <Art />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
 * Business scenes: small compositions for Storevia's business types
 * (onboarding, solutions, empty homes). 240 × 160 artboard.
 * ------------------------------------------------------------------------- */

const SCENES = {
  // A shopfront under a flat awning band; a window of products and a door.
  "online-store": () => (
    <>
      <path d="M16 144h208" className={SOFT} />
      <path
        d={d("M40", slantY(28, 64, 40), "V144M200", slantY(28, 64, 200), "V144")}
        className={INK}
      />
      <path d={band(28, 212, 44, 20)} className={ACCENT_TINT} />
      <rect x="56" y="84" width="84" height="44" rx="4" className={GHOST} />
      <rect x="64" y="92" width="20" height="26" rx="3" className={PAPER} />
      <rect x="88" y="92" width="20" height="26" rx="3" className={PAPER} />
      <rect x="112" y="92" width="20" height="26" rx="3" className={PAPER} />
      <path d="M156 144V88h28v56M163 118h3" className={INK} />
    </>
  ),
  // A site: navigation, the hero band, an image and feature cards.
  "business-website": () => (
    <>
      <rect x="24" y="16" width="192" height="128" rx="8" className={PAPER} />
      <path d="M24 34h192" className={INK} />
      <circle cx="35" cy="25" r="1.75" className="fill-navy-900 stroke-none" />
      <circle cx="42" cy="25" r="1.75" className="fill-navy-900 stroke-none" />
      <circle cx="49" cy="25" r="1.75" className="fill-neutral-300 stroke-none" />
      <path d={band(40, 124, 58, 16)} className={ACCENT_TINT} />
      <path d="M40 92h60M40 102h44" className={SOFT} />
      <rect x="136" y="50" width="64" height="56" rx="5" className={GHOST} />
      <rect x="40" y="116" width="48" height="16" rx="4" className={GHOST} />
      <rect x="96" y="116" width="48" height="16" rx="4" className={GHOST} />
      <rect x="152" y="116" width="48" height="16" rx="4" className={GHOST} />
    </>
  ),
  // An open magazine: pages at the mark's alternating slants.
  publication: () => (
    <>
      <path
        d={d("M120 30L40", slantY(120, 30, 40, -1), "V", slantY(120, 138, 40, -1), "L120 138z")}
        className={PAPER}
      />
      <path
        d={d("M120 30L200", slantY(120, 30, 200), "V", slantY(120, 138, 200), "L120 138z")}
        className={PAPER}
      />
      <path
        d={d(
          "M54",
          slantY(120, 46, 54, -1),
          "L106",
          slantY(120, 46, 106, -1),
          "v36L54",
          slantY(120, 82, 54, -1),
          "z",
        )}
        className={GHOST}
      />
      <path
        d={d(
          "M54",
          slantY(120, 100, 54, -1),
          "L106",
          slantY(120, 100, 106, -1),
          "M54",
          slantY(120, 112, 54, -1),
          "L94",
          slantY(120, 112, 94, -1),
        )}
        className={SOFT}
      />
      <path d={band(134, 186, 52, 10)} className={ACCENT_TINT} />
      <path
        d={d(
          "M134",
          slantY(134, 80, 134),
          "L186",
          slantY(134, 80, 186),
          "M134",
          slantY(134, 92, 134),
          "L186",
          slantY(134, 92, 186),
          "M134",
          slantY(134, 104, 134),
          "L170",
          slantY(134, 104, 170),
        )}
        className={SOFT}
      />
    </>
  ),
  // A masonry of work split at alternating slants; the featured piece is tinted.
  portfolio: () => (
    <>
      <path
        d={d("M36 22a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6V70L36", slantY(88, 70, 36), "z")}
        className={ACCENT_TINT}
      />
      <path
        d={d("M36", slantY(88, 78, 36), "L88 78V138a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6z")}
        className={PAPER}
      />
      <path
        d={d("M96 22a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6V44L96", slantY(148, 44, 96, -1), "z")}
        className={PAPER}
      />
      <path
        d={d("M96", slantY(148, 52, 96, -1), "L148 52V138a6 6 0 0 1-6 6h-40a6 6 0 0 1-6-6z")}
        className={GHOST}
      />
      <path
        d={d("M156 22a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6V", slantY(156, 86, 208), "L156 86z")}
        className={PAPER}
      />
      <path
        d={d("M156 94L208", slantY(156, 94, 208), "V138a6 6 0 0 1-6 6h-40a6 6 0 0 1-6-6z")}
        className={PAPER}
      />
    </>
  ),
  // A counter: a card terminal printing a receipt, and a bag.
  "retail-outlet": () => (
    <>
      <path d="M16 144h208" className={SOFT} />
      <rect x="28" y="104" width="184" height="40" rx="5" className={PAPER} />
      <path d="M28 116h184" className={SOFT} />
      <path
        d={d("M86 52V", slantY(86, 26, 86), "L122", slantY(86, 26, 122), "V52")}
        className={ACCENT_TINT}
      />
      <path
        d={d(
          "M94",
          slantY(86, 36, 94),
          "L114",
          slantY(86, 36, 114),
          "M94",
          slantY(86, 44, 94),
          "L108",
          slantY(86, 44, 108),
        )}
        className={ACCENT}
      />
      <rect x="76" y="52" width="56" height="52" rx="7" className={PAPER} />
      <rect x="86" y="62" width="36" height="14" rx="3" className={GHOST} />
      <path d="M90 88h4M102 88h4M114 88h4M90 96h4M102 96h4M114 96h4" className={INK} />
      <rect x="150" y="70" width="42" height="34" rx="4" className={PAPER} />
      <path d="M161 70v-6a10 10 0 0 1 20 0v6" className={INK} />
    </>
  ),
} as const satisfies Record<string, Art>;

/** Storevia's business types, by artwork key or by the domain's BusinessType value. */
export type BusinessSceneType =
  keyof typeof SCENES | "ECOMMERCE" | "BUSINESS" | "PUBLISHING" | "PORTFOLIO";

const SCENE_KEYS: Record<BusinessSceneType, keyof typeof SCENES> = {
  "online-store": "online-store",
  "business-website": "business-website",
  publication: "publication",
  portfolio: "portfolio",
  "retail-outlet": "retail-outlet",
  ECOMMERCE: "online-store",
  BUSINESS: "business-website",
  PUBLISHING: "publication",
  PORTFOLIO: "portfolio",
};

/** Every scene artwork key (galleries and tests). */
export const BUSINESS_SCENE_TYPES = Object.keys(SCENES) as (keyof typeof SCENES)[];

export interface BusinessSceneProps extends Omit<SVGProps<SVGSVGElement>, "type" | "children"> {
  type: BusinessSceneType;
  accent?: IllustrationAccent;
  /** Accessible name. Without it the scene is decorative (aria-hidden). */
  label?: string;
  /** @deprecated Use `label`. */
  title?: string;
}

/** Small line-art scene for a business type. Fills its container's width (3 : 2). */
export function BusinessScene({
  type,
  accent = "brand",
  className,
  ...others
}: BusinessSceneProps) {
  const key = SCENE_KEYS[type];
  const Art = SCENES[key];
  const [name_, props] = splitArtName(others);
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      data-scene={key}
      className={cn(
        "block aspect-[3/2] h-auto w-full [&_*]:[vector-effect:non-scaling-stroke]",
        FORCED,
        ACCENTS[accent],
        className,
      )}
      {...a11y(name_)}
      {...props}
    >
      {name_ ? <title>{name_}</title> : null}
      <Art />
    </svg>
  );
}
