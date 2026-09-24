// Storevia iconography (docs/architecture/12-design-system.md §4).
// One line-icon system: Lucide for interface icons, rendered through <Icon>
// so every icon shares the same sizes and stroke; plus a small set of custom
// Storevia glyphs, drawn in the same line language, for product concepts
// that generic icons don't express well. No emoji, no mixed icon packs.
import type { LucideIcon } from "lucide-react";
import type { SVGProps } from "react";
import { cn } from "./cn";

export const ICON_STROKE = 1.75;

const SIZES = { xs: "size-3.5", sm: "size-4", md: "size-5", lg: "size-6", xl: "size-8" } as const;
export type IconSize = keyof typeof SIZES;

/** An interface icon. Decorative by default; pass `label` when it carries meaning alone. */
export function Icon({
  icon: Component,
  size = "sm",
  label,
  className,
}: {
  icon: LucideIcon;
  size?: IconSize;
  label?: string;
  className?: string;
}) {
  return (
    <Component
      strokeWidth={ICON_STROKE}
      className={cn(SIZES[size], "shrink-0", className)}
      {...(label ? { "aria-label": label, role: "img" } : { "aria-hidden": true })}
    />
  );
}

/** Custom Storevia product glyphs (24 × 24 grid, 1.5 stroke, round joins). */
const GLYPHS = {
  "online-store": (
    <>
      <path d="M4 4h16l1.2 4.6a2.9 2.9 0 0 1-5.4 1.4 2.9 2.9 0 0 1-3.8 1.3 2.9 2.9 0 0 1-3.8-1.3A2.9 2.9 0 0 1 2.8 8.6z" />
      <path d="M5 12.5V20h14v-7.5" />
      <path d="M10 20v-4.5h4V20" />
    </>
  ),
  "business-website": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 8.5h18" />
      <path d="M6.5 6.25h.01M9 6.25h.01" />
      <rect x="6.5" y="11.5" width="5" height="5" rx="1" />
      <path d="M14.5 12.5h3M14.5 15.5h3" />
    </>
  ),
  publication: (
    <>
      <path d="M6 3h8.5L18 6.5V21H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 11h6M9 14h6M9 17h3.5" />
    </>
  ),
  portfolio: (
    <>
      <rect x="3" y="3" width="8" height="10" rx="1.75" />
      <rect x="13" y="3" width="8" height="6" rx="1.75" />
      <rect x="13" y="11" width="8" height="10" rx="1.75" />
      <rect x="3" y="15" width="8" height="6" rx="1.75" />
    </>
  ),
  builder: (
    <>
      <rect x="3" y="3" width="18" height="6" rx="1.75" />
      <rect x="3" y="11" width="8" height="10" rx="1.75" />
      <path d="M14 12.5l6.5 2.4-2.9 1.1-1.1 2.9z" />
    </>
  ),
  commerce: (
    <>
      <path d="M4.5 8h15l-1.2 12.5H5.7z" />
      <path d="M9 10.5V6.5a3 3 0 0 1 6 0v4" />
    </>
  ),
  content: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
      <path d="M13 20h7" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 20.5h18" />
      <rect x="5" y="12" width="3" height="6" rx="0.75" />
      <rect x="10.5" y="8" width="3" height="10" rx="0.75" />
      <rect x="16" y="4.5" width="3" height="13.5" rx="0.75" />
    </>
  ),
  domains: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.6 5.6 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.6-3.6-9S9.5 5.6 12 3z" />
    </>
  ),
  themes: (
    <>
      <rect x="3" y="4" width="7" height="16" rx="1.75" />
      <path d="M10 8.5l4.3-2.5 3.6 6.2L10 16.8" />
      <path d="M10 20h9.2a1.8 1.8 0 0 0 1.8-1.8V15" />
      <path d="M6.5 16.5h.01" />
    </>
  ),
  teams: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.9c1.6.8 2.7 2.5 3 5.1" />
    </>
  ),
  retail: (
    <>
      <rect x="5" y="3" width="14" height="10" rx="1.75" />
      <path d="M8.5 7h7" />
      <path d="M7.5 16.5h9L18 21H6z" />
      <path d="M12 13v3.5" />
    </>
  ),
} as const;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({
  name,
  className,
  ...props
}: { name: GlyphName } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
      {...props}
    >
      {GLYPHS[name]}
    </svg>
  );
}

/** A glyph on a soft tile: the standard way to headline a product concept. */
export function GlyphTile({
  name,
  tone = "brand",
  size = "md",
  className,
}: {
  name: GlyphName;
  tone?: "brand" | "neutral";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = {
    sm: "size-9 rounded-control",
    md: "size-11 rounded-card",
    lg: "size-14 rounded-card",
  }[size];
  const glyph = { sm: "size-5", md: "size-6", lg: "size-7" }[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        box,
        tone === "brand"
          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100 ring-inset"
          : "bg-subtle text-ink ring-1 ring-line ring-inset",
        className,
      )}
    >
      <Glyph name={name} className={glyph} />
    </span>
  );
}

/**
 * Storevia logo: monogram tile + wordmark. `variant="admin"` is for the dark
 * staff-tool bar: white wordmark and an "Internal" tag.
 */
export function Logo({
  className,
  variant = "default",
  monogramOnly = false,
}: {
  className?: string;
  variant?: "default" | "admin" | "inverse";
  monogramOnly?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7 shrink-0">
        <rect width="24" height="24" rx="7" className="fill-brand-600" />
        <path
          d="M7.2 15.3c1.2 1.15 2.8 1.75 4.6 1.75 2.3 0 3.9-1.1 3.9-2.8 0-1.6-1.2-2.3-3.6-2.8-2.1-.4-2.9-.8-2.9-1.6 0-.8.8-1.35 2-1.35 1.3 0 2.4.5 3.2 1.2"
          fill="none"
          stroke="#fff"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
      {monogramOnly ? (
        <span className="sr-only">Storevia</span>
      ) : (
        <span className={variant === "default" ? "text-ink" : "text-white"}>Storevia</span>
      )}
      {variant === "admin" ? (
        <span className="rounded-xs bg-warning-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-950">
          Internal
        </span>
      ) : null}
    </span>
  );
}
