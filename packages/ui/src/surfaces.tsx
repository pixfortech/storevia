// Surfaces (docs/design/design-plan.md §5): cards, page and section headers,
// badges, status dots, alerts, empty states, skeletons, avatars and dividers.
//
// Server-safe: no hooks or browser APIs, so server components render these
// without a client boundary. Depth is a hairline first; shadows stay quiet.
import { CircleCheck, Info, OctagonAlert, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { IconButton } from "./button";
import { cn } from "./cn";
import { Icon } from "./icons";

/* ----------------------------------------------------------------------------
 * Card
 * ------------------------------------------------------------------------- */

export type CardVariant = "default" | "raised" | "interactive" | "sunken" | "dashed";

const CARD_VARIANTS: Record<CardVariant, string> = {
  default: "border border-line bg-surface",
  raised: "border border-line bg-surface shadow-card",
  // Cards that are links share HoverLift's contract (motion.css): 2 px and the
  // raised shadow over 200 ms, on hover and keyboard focus, pointer devices
  // only; the movement goes under reduced motion.
  interactive: cn(
    "sv-motion-lift border border-line bg-surface shadow-card",
    "hover:border-line-strong focus-visible:border-line-strong",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  ),
  sunken: "border border-line bg-subtle",
  // Placeholders and empty slots: present, but clearly not content yet.
  dashed: "border border-dashed border-line-strong bg-surface",
};

/** Class names for anything that should look like a card (e.g. a link tile). */
export function cardClasses(variant: CardVariant = "default", className?: string): string {
  return cn("block min-w-0 rounded-card text-ink", CARD_VARIANTS[variant], className);
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** default: hairline · raised: + card shadow · interactive: hover lift (for links) · sunken: quiet well · dashed: placeholder. */
  variant?: CardVariant;
}

export function Card({ variant = "default", className, ...props }: CardProps) {
  return <div className={cardClasses(variant, className)} {...props} />;
}

type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level. Default h2 (a card is usually a page section). */
  as?: HeadingLevel;
}

export function CardTitle({ as: Heading = "h2", className, ...props }: CardTitleProps) {
  return (
    <Heading
      className={cn("font-display text-body font-semibold tracking-[-0.01em] text-ink", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-body-sm text-ink-muted", className)} {...props} />;
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, badges or a menu on the right. */
  actions?: ReactNode;
  /** A leading icon or GlyphTile. */
  icon?: ReactNode;
  titleAs?: HeadingLevel;
  /** Hairline under the header. Default true (headers usually sit on a list or table). */
  divider?: boolean;
  className?: string;
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  titleAs,
  divider = true,
  className,
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-4.5 sm:px-6",
        divider ? "border-b border-line pb-4" : "pb-0",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon ? <div className="shrink-0">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          <CardTitle {...(titleAs ? { as: titleAs } : {})}>{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * Page and section headers
 * ------------------------------------------------------------------------- */

export interface PageHeaderProps {
  title: ReactNode;
  /** Small caps line above the title (e.g. the area or organisation). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** The page's actions; the primary one last. They wrap under the title on phones. */
  actions?: ReactNode;
  /** A Breadcrumb (from the controls module) or any node above the header. */
  breadcrumb?: ReactNode;
  /** Status badges or facts beside the title (e.g. "Published"). */
  meta?: ReactNode;
  /** Hairline under the header. */
  divider?: boolean;
  /** Heading level. Default h1 (the page's one h1); lower it where the header isn't the page's. */
  as?: HeadingLevel;
  className?: string;
}

/** The top of a page: one h1, a short description and the page's actions. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  breadcrumb,
  meta,
  divider = false,
  as: Heading = "h1",
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("min-w-0", divider && "border-b border-line pb-6 sm:pb-8", className)}>
      {breadcrumb ? <div className="mb-5">{breadcrumb}</div> : null}
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="min-w-0 max-w-(--container-prose)">
          {eyebrow ? (
            <p className="mb-2.5 text-overline text-ink-faint uppercase">{eyebrow}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Heading className="min-w-0 font-display text-h3 text-ink md:text-h2">{title}</Heading>
            {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
          {description ? <p className="mt-2.5 text-body text-ink-muted">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  /** Heading level. Default h2. */
  as?: HeadingLevel;
  className?: string;
}

/** Heads a group of cards or settings inside a page. */
export function SectionHeader({
  title,
  description,
  actions,
  eyebrow,
  as: Heading = "h2",
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 max-w-(--container-prose)">
        {eyebrow ? (
          <p className="mb-1.5 text-overline text-ink-faint uppercase">{eyebrow}</p>
        ) : null}
        <Heading className="font-display text-h4 text-ink">{title}</Heading>
        {description ? <p className="mt-1 text-body-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Badge and StatusDot
 * ------------------------------------------------------------------------- */

export type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";
export type BadgeVariant = "soft" | "outline" | "dot";
export type BadgeSize = "sm" | "md";

/** Soft fills: the {tone}-50 wash, {tone}-700 text (AA) and a {tone}-100 hairline. */
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-50 text-neutral-700 ring-neutral-150",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  accent: "bg-accent-50 text-accent-700 ring-accent-100",
  success: "bg-success-50 text-success-700 ring-success-100",
  warning: "bg-warning-50 text-warning-700 ring-warning-100",
  danger: "bg-danger-50 text-danger-700 ring-danger-100",
  info: "bg-info-50 text-info-700 ring-info-100",
};

const BADGE_OUTLINE: Record<BadgeTone, string> = {
  neutral: "text-ink-muted ring-line-strong",
  brand: "text-brand-700 ring-brand-200",
  accent: "text-accent-700 ring-accent-200",
  success: "text-success-700 ring-success-500/40",
  warning: "text-warning-700 ring-warning-500/45",
  danger: "text-danger-700 ring-danger-500/40",
  info: "text-info-700 ring-brand-200",
};

/** Solid dot colours for Badge dots and StatusDot. */
const DOT_TONES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-400",
  brand: "bg-brand-500",
  accent: "bg-accent-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
  info: "bg-info-500",
};

// Forced colours drop background fills, which would erase the dots: draw them
// in the text colour instead (the words beside them carry the status).
const DOT_FORCED = "forced-color-adjust-none forced-colors:bg-[CanvasText]";

const BADGE_SIZES: Record<BadgeSize, string> = {
  sm: "h-5 gap-1 px-1.5",
  md: "h-6 gap-1.5 px-2",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** soft (default): tinted fill · outline: hairline only · dot: neutral pill with a coloured dot. */
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** A leading dot on soft and outline badges (dot badges always have one). */
  dot?: boolean;
  /** A leading Lucide icon. */
  icon?: LucideIcon;
}

/** A short status or category label. The words carry the meaning; colour only supports them. */
export function Badge({
  tone = "neutral",
  variant = "soft",
  size = "md",
  dot = false,
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  const showDot = variant === "dot" || dot;
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center rounded-pill text-caption font-medium whitespace-nowrap ring-1 ring-inset",
        BADGE_SIZES[size],
        variant === "soft" && BADGE_TONES[tone],
        variant === "outline" && cn("bg-surface", BADGE_OUTLINE[tone]),
        variant === "dot" && "bg-surface text-ink-muted ring-line-strong",
        className,
      )}
      {...props}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", DOT_TONES[tone], DOT_FORCED)}
        />
      ) : null}
      {icon ? <Icon icon={icon} size="xs" className="-ml-0.5" /> : null}
      {children}
    </span>
  );
}

export interface ExampleDataBadgeProps {
  size?: BadgeSize;
  className?: string;
}

/**
 * The one marker for example figures (KpiCard, Metric, ChartCard, product
 * visuals and galleries): a quiet neutral dot badge that always reads
 * "Example data". Neutral on purpose: violet belongs to comparison data and
 * amber to warnings. Development previews only; production never shows
 * invented numbers.
 */
export function ExampleDataBadge({ size = "sm", className }: ExampleDataBadgeProps) {
  return (
    <Badge variant="dot" size={size} data-example-data="" className={className}>
      Example data
    </Badge>
  );
}

export interface StatusDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tone?: BadgeTone;
  /** A slow halo for "live" states. Static under reduced motion. */
  pulse?: boolean;
  /** Accessible name (e.g. "Online"). Without it the dot is decorative. */
  label?: string;
  size?: "sm" | "md";
}

/** A small status indicator. Pair it with visible text, or give it a label. */
export function StatusDot({
  tone = "neutral",
  pulse = false,
  label,
  size = "md",
  className,
  ...props
}: StatusDotProps) {
  const box = size === "sm" ? "size-1.5" : "size-2";
  return (
    <span
      className={cn("relative inline-flex shrink-0", box, className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...props}
    >
      {pulse ? (
        <span
          className={cn(
            "absolute inset-0 animate-ping rounded-full opacity-50 [animation-duration:1.8s] motion-reduce:hidden forced-colors:hidden",
            DOT_TONES[tone],
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex rounded-full", box, DOT_TONES[tone], DOT_FORCED)} />
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Alert
 * ------------------------------------------------------------------------- */

export type AlertTone = "info" | "success" | "warning" | "danger" | "neutral";

const ALERT_TONES: Record<AlertTone, { box: string; icon: string; glyph: LucideIcon }> = {
  info: { box: "border-brand-100 bg-brand-25", icon: "text-brand-600", glyph: Info },
  success: {
    box: "border-success-100 bg-success-50",
    icon: "text-success-600",
    glyph: CircleCheck,
  },
  warning: {
    box: "border-warning-100 bg-warning-50",
    icon: "text-warning-600",
    glyph: TriangleAlert,
  },
  danger: { box: "border-danger-100 bg-danger-50", icon: "text-danger-600", glyph: OctagonAlert },
  neutral: { box: "border-line bg-subtle", icon: "text-ink-faint", glyph: Info },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  /** The message. `description` is an alias for callers that prefer a prop. */
  children?: ReactNode;
  description?: ReactNode;
  /** Buttons or links under the message. */
  actions?: ReactNode;
  /** Replace the tone's icon, or `false` for none. */
  icon?: LucideIcon | false;
  /**
   * Shows a dismiss button (client components only). The alert usually
   * unmounts, taking the focused button with it, so move focus to a sensible
   * neighbour here (the next control, or the region's heading with
   * tabIndex={-1}); otherwise focus falls to <body>.
   */
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * An inline message. Danger alerts are announced assertively (role="alert");
 * the rest politely (role="status"). The icon and title carry the tone, so it
 * never relies on colour alone.
 */
export function Alert({
  tone = "info",
  title,
  children,
  description,
  actions,
  icon,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
  ...props
}: AlertProps) {
  const t = ALERT_TONES[tone];
  const body = children ?? description;
  const glyph = icon === false ? null : (icon ?? t.glyph);
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-card border px-4 py-3.5 text-body-sm text-ink",
        t.box,
        className,
      )}
      {...props}
    >
      {glyph ? <Icon icon={glyph} size="md" className={cn("mt-px", t.icon)} /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {body ? (
          <div className={cn("text-ink-muted", title ? "mt-0.5" : undefined)}>{body}</div>
        ) : null}
        {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton
          icon={X}
          size="sm"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="-my-1.5 -mr-2 text-ink-faint hover:bg-neutral-900/5"
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * EmptyState
 * ------------------------------------------------------------------------- */

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** A 96–120 px illustration (e.g. <Illustration>). Takes precedence over `icon`. */
  illustration?: ReactNode;
  /** A small icon, shown on a soft brand tile. */
  icon?: ReactNode;
  /** The primary action. */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Less padding and a smaller title, for cards and table bodies. */
  compact?: boolean;
  titleAs?: HeadingLevel;
  className?: string;
}

/** What to show before there is anything: say what will be here and how to start. */
export function EmptyState({
  title,
  description,
  illustration,
  icon,
  action,
  secondaryAction,
  compact = false,
  titleAs: Heading = "h2",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "px-5 py-10" : "px-6 py-14 sm:py-16",
        className,
      )}
    >
      {illustration ? (
        <div
          className={cn(
            "flex items-center justify-center",
            // An <Illustration> brings its own air (its artboard leaves ~24 of
            // 120 units under the drawing), so it sits closer to the title than
            // a tile does; the visible gap stays about 32 px either way.
            compact
              ? "mb-4 has-[>svg[data-illustration]]:mb-1"
              : "mb-6 has-[>svg[data-illustration]]:mb-2",
          )}
        >
          {illustration}
        </div>
      ) : icon ? (
        <div
          className={cn(
            "mb-5 flex items-center justify-center rounded-card bg-brand-50 text-brand-700 ring-1 ring-brand-100 ring-inset",
            compact ? "size-10" : "size-12",
          )}
        >
          {icon}
        </div>
      ) : null}
      <Heading
        className={cn(
          "max-w-md font-display text-ink",
          compact ? "text-body font-semibold" : "text-h4",
        )}
      >
        {title}
      </Heading>
      {description ? (
        <p
          className={cn(
            "mt-2 max-w-md text-ink-muted",
            compact ? "text-body-sm" : "text-body-sm sm:text-body",
          )}
        >
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center gap-3",
            compact ? "mt-5" : "mt-7",
          )}
        >
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Skeleton
 * ------------------------------------------------------------------------- */

export type SkeletonShape = "text" | "circle" | "rect";

export interface SkeletonProps {
  shape?: SkeletonShape;
  /** For text: the number of lines (the last one is shorter). */
  lines?: number;
  className?: string;
}

// The same quiet sweep as the chart skeleton (charts.css): a light band
// travels over a neutral fill. Under reduced motion it rests as a flat fill.
const SHIMMER = cn(
  "bg-muted bg-[linear-gradient(90deg,transparent_0%,color-mix(in_srgb,var(--color-surface)_80%,transparent)_50%,transparent_100%)] bg-size-[200%_100%] bg-no-repeat",
  "animate-shimmer motion-reduce:animate-none motion-reduce:bg-none",
);

/** A loading placeholder. Decorative: mark the loading region with aria-busy instead. */
export function Skeleton({ shape = "rect", lines = 1, className }: SkeletonProps) {
  if (shape === "text" && lines > 1) {
    return (
      <div aria-hidden="true" className={cn("flex flex-col gap-2.5", className)}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn("h-3 rounded-xs", SHIMMER, i === lines - 1 ? "w-3/5" : "w-full")}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        SHIMMER,
        shape === "text" && "h-3 w-full rounded-xs",
        shape === "circle" && "size-10 rounded-full",
        shape === "rect" && "rounded-control",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------------------------
 * Avatar
 * ------------------------------------------------------------------------- */

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const AVATAR_SIZES: Record<AvatarSize, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-caption",
  lg: "size-10 text-label",
  xl: "size-12 text-body-sm",
};

/** Quiet tints from the mark's palette; text is the same hue at 700–800 (AA). */
const AVATAR_TINTS = [
  "bg-brand-50 text-brand-800",
  "bg-brand-100 text-brand-800",
  "bg-accent-50 text-accent-700",
  "bg-accent-100 text-accent-800",
  "bg-navy-50 text-navy-700",
  "bg-navy-100 text-navy-800",
] as const;

/** Initials from the first and last words ("Amara Okafor" → "AO"). */
export function avatarInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => /[\p{L}\p{N}]/u.exec(word)?.[0] ?? "")
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  return (first + last).toLocaleUpperCase("en-GB");
}

/** The same name always gets the same tint (FNV-1a hash of the name). */
export function avatarTint(name: string): string {
  let hash = 0x811c9dc5;
  for (const char of name.trim().toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return AVATAR_TINTS[(hash >>> 0) % AVATAR_TINTS.length] ?? AVATAR_TINTS[0];
}

export interface AvatarProps {
  name: string;
  /** Photo or logo URL. If it fails to load, the initials show through. */
  src?: string | undefined;
  size?: AvatarSize;
  /** circle (people) or square (stores, organisations). */
  shape?: "circle" | "square";
  /** Accessible name. Without it the avatar is decorative (the name is usually beside it). */
  label?: string;
  className?: string;
}

export function Avatar({
  name,
  src,
  size = "md",
  shape = "circle",
  label,
  className,
}: AvatarProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold tracking-[0.01em] select-none",
        AVATAR_SIZES[size],
        shape === "circle" ? "rounded-full" : "rounded-control",
        avatarTint(name),
        className,
      )}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {avatarInitials(name)}
      {src ? (
        // A broken image with empty alt renders nothing, so the initials
        // underneath are the fallback without any client state.
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
    </span>
  );
}

export interface AvatarGroupProps {
  people: readonly { name: string; src?: string | undefined }[];
  /** Avatars shown before "+N". Default 4. */
  max?: number;
  size?: AvatarSize;
  /** Names the group (e.g. "Team members"). */
  label?: string;
  className?: string;
}

// Overlap scales with size so the initials are never covered.
const AVATAR_OVERLAP: Record<AvatarSize, string> = {
  xs: "-space-x-0.5",
  sm: "-space-x-0.5",
  md: "-space-x-1",
  lg: "-space-x-1.5",
  xl: "-space-x-2",
};

/** Overlapping avatars with a "+N" count. Each avatar is named for screen readers. */
export function AvatarGroup({ people, max = 4, size = "md", label, className }: AvatarGroupProps) {
  const shown = people.slice(0, Math.max(0, max));
  const rest = people.length - shown.length;
  return (
    <div
      role="group"
      {...(label ? { "aria-label": label } : {})}
      className={cn("flex items-center", AVATAR_OVERLAP[size], className)}
    >
      {shown.map((person, i) => (
        <Avatar
          key={`${person.name}-${String(i)}`}
          name={person.name}
          src={person.src}
          size={size}
          label={person.name}
          className="ring-2 ring-surface"
        />
      ))}
      {rest > 0 ? (
        <span
          role="img"
          aria-label={`and ${String(rest)} more`}
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-ink-muted ring-2 ring-surface tabular-nums",
            AVATAR_SIZES[size],
          )}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * VisuallyHidden and Divider
 * ------------------------------------------------------------------------- */

/** Text for screen readers only. */
export function VisuallyHidden({
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return (
    <span className="sr-only" {...props}>
      {children}
    </span>
  );
}

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  /** A centred label on a horizontal divider (e.g. "or"). */
  label?: ReactNode;
  /** Purely visual (no separator role). Default false. */
  decorative?: boolean;
  className?: string;
}

export function Divider({
  orientation = "horizontal",
  label,
  decorative = false,
  className,
}: DividerProps) {
  const a11y = decorative
    ? { role: "none" as const }
    : { role: "separator" as const, "aria-orientation": orientation };
  if (orientation === "vertical") {
    return <div {...a11y} className={cn("w-px self-stretch bg-line", className)} />;
  }
  if (label) {
    return (
      <div {...a11y} className={cn("flex items-center gap-3", className)}>
        <span className="h-px flex-1 bg-line" />
        <span className="text-caption text-ink-faint">{label}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    );
  }
  return <div {...a11y} className={cn("h-px w-full bg-line", className)} />;
}
