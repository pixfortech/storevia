"use client";
// Navigation controls: Tabs, Breadcrumb and Pagination (docs/design/design-plan.md
// §8–§12; the marketing header's NavigationMenu is in navigation-menu.tsx). Radix supplies
// roving focus and menu behaviour; brand blue marks the current place.
//
// A client module (Tabs share their look through context), so props from
// server components must be serialisable: Pagination takes `hrefTemplate`
// there, and `getHref` or `onPageChange` in client code. paginationRange()
// lives in button.tsx (server-safe) so server code can call it too.
//
// Forced-colours mode drops fills and shadows: the current tab, page and
// pill are marked with a border or outline as well.
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { paginationRange } from "./control-helpers";
import { cn } from "./cn";
import { Icon } from "./icons";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/* ----------------------------------------------------------------------------
 * Tabs
 * ------------------------------------------------------------------------- */

/** "line": underline tabs for page sections. "pill": contained tabs for panels and cards. */
export type TabsVariant = "line" | "pill";

const TabsVariantContext = createContext<TabsVariant>("line");

export interface TabsProps extends ComponentPropsWithRef<typeof TabsPrimitive.Root> {
  variant?: TabsVariant;
}

export function Tabs({ variant = "line", className, ...props }: TabsProps) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.Root className={cn("min-w-0", className)} {...props} />
    </TabsVariantContext.Provider>
  );
}

export type TabsListProps = ComponentPropsWithRef<typeof TabsPrimitive.List>;

export function TabsList({ className, ...props }: TabsListProps) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.List
      className={cn(
        variant === "line"
          ? // The hairline is an inset shadow so the active indicator can sit on top of it.
            "flex max-w-full items-stretch gap-4 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : // Like SegmentedControl: a line-control track; the active tab is outlined.
            "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-control border border-line-control bg-muted p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export type TabsTriggerProps = ComponentPropsWithRef<typeof TabsPrimitive.Trigger>;

export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-body-sm font-medium text-ink-muted",
        "transition-[color,background-color,box-shadow] duration-(--duration-fast) ease-(--ease-standard)",
        "hover:text-ink data-[state=active]:text-ink",
        "disabled:pointer-events-none disabled:text-ink-faint/60",
        "focus-visible:outline-2 focus-visible:outline-focus",
        // At least 44 px wide on touch screens (both looks are 44 tall there).
        "pointer-coarse:min-w-11",
        variant === "line"
          ? cn(
              // Padding gives the inset focus ring room; the indicator stays at text width.
              "h-11 rounded-sm px-1.5 focus-visible:-outline-offset-2",
              // A border rather than a fill, so forced colours still draw it.
              "after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-pill after:border-t-2 after:border-brand-600",
              "after:origin-center after:scale-x-0 after:transition-[scale] after:duration-(--duration-base) after:ease-(--ease-emphasised)",
              "data-[state=active]:after:scale-x-100",
            )
          : cn(
              "h-8 rounded-[5px] px-3 focus-visible:-outline-offset-1",
              "data-[state=active]:bg-surface data-[state=active]:shadow-[inset_0_0_0_1px_var(--color-line-control),0_1px_2px_rgb(11_21_48/0.05)]",
              "forced-colors:data-[state=active]:outline-1 forced-colors:data-[state=active]:-outline-offset-1",
              // Touch: 40 px tall with a 44 px hit area, inside the list's padding
              // (the list scrolls sideways, so anything further out is clipped).
              "pointer-coarse:h-10 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-0.5",
            ),
        className,
      )}
      {...props}
      // Radix points every tab at its panel; a disabled tab usually has none.
      {...(props.disabled ? { "aria-controls": undefined } : {})}
    />
  );
}

export type TabsContentProps = ComponentPropsWithRef<typeof TabsPrimitive.Content>;

export function TabsContent({ className, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "mt-6 rounded-xs data-[state=active]:animate-fade-in focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus",
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * Breadcrumb
 * ------------------------------------------------------------------------- */

export interface BreadcrumbItem {
  label: ReactNode;
  /** Omit for the current page (the last item) or an unlinked level. */
  href?: string;
}

export interface BreadcrumbProps {
  /** Root first; the last item is the current page. */
  items: readonly BreadcrumbItem[];
  /** Link component for client-side routing (e.g. next/link). Default <a>. */
  linkAs?: ElementType;
  /** On phones, fold everything above the parent into "…" (tap to expand). Default true. */
  collapse?: boolean;
  "aria-label"?: string;
  className?: string;
}

function Separator() {
  return <Icon icon={ChevronRight} size="xs" className="text-neutral-400" />;
}

// Room each visible ancestor needs at its narrowest: the separator (14 px)
// and two 6 px gaps, with the label truncated away. The "…" item needs its
// 24 px button as well. The current page may take the rest of the row.
const ANCESTOR_REM = 1.625;
const FOLD_REM = 3.125;

/**
 * Where the current page sits. The last item is marked aria-current="page".
 * The current page keeps its full label as long as it fits; ancestors
 * truncate first. On phones, trails of three or more levels show
 * "… › parent › current", and "…" expands the full trail.
 */
export function Breadcrumb({
  items,
  linkAs: Link = "a",
  collapse = true,
  "aria-label": ariaLabel = "Breadcrumb",
  className,
}: BreadcrumbProps) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const focusRevealed = useRef(false);
  const folding = collapse && !expanded && items.length >= 3;
  const lastIndex = items.length - 1;

  useEffect(() => {
    if (!expanded || !focusRevealed.current) return;
    focusRevealed.current = false;
    // The "…" button has gone; carry on from the first level it revealed.
    const link = rootRef.current?.querySelector<HTMLElement>("a[href], button");
    (link ?? listRef.current)?.focus();
  }, [expanded]);

  const reserve = (ancestors: number) => (expanded ? 0 : ancestors * ANCESTOR_REM);
  const style = {
    "--breadcrumb-reserve": `${String(folding ? FOLD_REM + ANCESTOR_REM : reserve(lastIndex))}rem`,
    "--breadcrumb-reserve-sm": `${String(reserve(lastIndex))}rem`,
  } as CSSProperties;

  return (
    <nav aria-label={ariaLabel} className={cn("min-w-0", className)}>
      <ol
        ref={listRef}
        tabIndex={-1}
        style={style}
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-body-sm outline-none",
          expanded ? "flex-wrap" : "flex-nowrap",
        )}
      >
        {folding ? (
          <li className="flex shrink-0 items-center gap-1.5 sm:hidden">
            <button
              type="button"
              aria-label="Show all breadcrumb levels"
              onClick={() => {
                focusRevealed.current = true;
                setExpanded(true);
              }}
              className={cn(
                "relative inline-flex h-6 items-center rounded-xs px-1 text-ink-muted hover:bg-muted hover:text-ink",
                "pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5",
                FOCUS_RING,
              )}
            >
              <Icon icon={Ellipsis} size="sm" />
            </button>
            <Separator />
          </li>
        ) : null}
        {items.map((item, index) => {
          const current = index === lastIndex;
          const folded = folding && index < lastIndex - 1;
          return (
            <li
              key={index}
              ref={index === 0 ? rootRef : undefined}
              className={cn(
                // min-w-0: flex items otherwise never shrink below their
                // content, so ancestors would not truncate.
                "flex min-w-0 items-center gap-1.5",
                // Ancestors shrink (down to their separator); the current page
                // doesn't, up to what the row can spare after its ancestors.
                current &&
                  "min-w-0 shrink-0 max-w-[calc(100%-var(--breadcrumb-reserve))] sm:max-w-[calc(100%-var(--breadcrumb-reserve-sm))]",
                folded && "hidden sm:flex",
              )}
            >
              {current ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {item.label}
                </span>
              ) : item.href !== undefined ? (
                <Link
                  href={item.href}
                  className={cn(
                    "max-w-40 truncate rounded-xs text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink sm:max-w-56",
                    // Touch: padding (inside the truncating box) makes it 45 px tall.
                    "pointer-coarse:-my-3 pointer-coarse:py-3",
                    FOCUS_RING,
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="max-w-40 truncate text-ink-muted sm:max-w-56">{item.label}</span>
              )}
              {current ? null : <Separator />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ----------------------------------------------------------------------------
 * Pagination
 * ------------------------------------------------------------------------- */

export interface PaginationProps {
  /** Current page, 1-based. */
  page: number;
  totalPages: number;
  /** Client-side paging (renders buttons). */
  onPageChange?: (page: number) => void;
  /** Link paging from client code. */
  getHref?: (page: number) => string;
  /** Link paging from server components: "{page}" is replaced, e.g. "?page={page}". */
  hrefTemplate?: string;
  /** Link component for client-side routing (e.g. next/link). Default <a>. */
  linkAs?: ElementType;
  /** Pages either side of the current one. Default 1. */
  siblings?: number;
  /** Always show "Page 3 of 12" instead of numbers (phones always do). */
  compact?: boolean;
  "aria-label"?: string;
  className?: string;
}

const PAGE_ITEM = cn(
  "relative inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-control px-2.5 text-body-sm font-medium tabular-nums text-ink-muted",
  "transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-muted hover:text-ink",
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-muted",
  // Touch: 44 × 44 at least (36 tall plus an invisible extension).
  "pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1",
  FOCUS_RING,
);

/**
 * Previous / next with page numbers; collapses to "Page n of m" on phones.
 * At either end the previous or next control stays in place, marked
 * aria-disabled: with buttons it keeps keyboard focus (so paging to the end
 * doesn't drop you at the top of the document), and a link loses its href.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  getHref,
  hrefTemplate,
  linkAs: Link = "a",
  siblings = 1,
  compact = false,
  "aria-label": ariaLabel = "Pagination",
  className,
}: PaginationProps) {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), total);
  const hrefFor = (target: number): string | undefined =>
    getHref?.(target) ?? hrefTemplate?.replaceAll("{page}", String(target));

  const control = (
    target: number,
    content: ReactNode,
    options: {
      label: string;
      disabled?: boolean;
      isCurrent?: boolean;
      rel?: string;
      className?: string;
    },
  ) => {
    const classes = cn(
      PAGE_ITEM,
      options.isCurrent &&
        "bg-brand-50 text-brand-700 hover:bg-brand-50 hover:text-brand-700 forced-colors:outline-1 forced-colors:-outline-offset-1",
      options.className,
    );
    const href = hrefFor(target);
    if (href !== undefined) {
      if (options.disabled) {
        // A link with nowhere to go: no href, still named and announced as a link.
        return (
          <a role="link" aria-disabled="true" aria-label={options.label} className={classes}>
            {content}
          </a>
        );
      }
      return (
        <Link
          href={href}
          rel={options.rel}
          aria-label={options.label}
          aria-current={options.isCurrent ? "page" : undefined}
          onClick={
            onPageChange
              ? () => {
                  onPageChange(target);
                }
              : undefined
          }
          className={classes}
        >
          {content}
        </Link>
      );
    }
    // The same element either way, so a focused Next stays focused on the last page.
    return (
      <button
        type="button"
        aria-label={options.label}
        aria-current={options.isCurrent ? "page" : undefined}
        aria-disabled={options.disabled ? true : undefined}
        onClick={options.disabled ? undefined : () => onPageChange?.(target)}
        className={classes}
      >
        {content}
      </button>
    );
  };

  return (
    <nav aria-label={ariaLabel} className={cn("min-w-0", className)}>
      <ul className="flex items-center gap-1">
        <li>
          {control(
            current - 1,
            <>
              <Icon icon={ChevronLeft} size="sm" />
              <span className={cn("hidden", !compact && "sm:inline")}>Previous</span>
            </>,
            {
              label: "Previous page",
              disabled: current <= 1,
              rel: "prev",
              className: "px-2 sm:pr-3",
            },
          )}
        </li>
        {compact
          ? null
          : paginationRange(current, total, siblings).map((item, index) =>
              item === "ellipsis" ? (
                <li
                  key={`ellipsis-${String(index)}`}
                  aria-hidden="true"
                  className="hidden size-9 items-center justify-center text-ink-faint sm:flex"
                >
                  <Icon icon={Ellipsis} size="sm" />
                </li>
              ) : (
                <li key={item} className="hidden sm:block">
                  {control(item, item, {
                    label: `Page ${String(item)}`,
                    isCurrent: item === current,
                  })}
                </li>
              ),
            )}
        <li
          className={cn(
            "px-2 text-body-sm whitespace-nowrap text-ink-muted tabular-nums",
            !compact && "sm:hidden",
          )}
        >
          Page <span className="font-medium text-ink">{current}</span> of {total}
        </li>
        <li>
          {control(
            current + 1,
            <>
              <span className={cn("hidden", !compact && "sm:inline")}>Next</span>
              <Icon icon={ChevronRight} size="sm" />
            </>,
            {
              label: "Next page",
              disabled: current >= total,
              rel: "next",
              className: "px-2 sm:pl-3",
            },
          )}
        </li>
      </ul>
    </nav>
  );
}
