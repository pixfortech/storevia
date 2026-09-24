// A faithful miniature of the real Storevia dashboard, built from the same
// navigation definitions the product uses (ADR-0024). Decorative: it's
// labelled as one image and holds no focusable controls or invented data.
import { ROLE_PERMISSIONS } from "@storevia/tenancy/rbac";
import {
  BUSINESS_TYPE_DEFINITIONS,
  storeNavigation,
  type AreaKey,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { cn, GlyphTile, ICON_STROKE } from "@storevia/ui";
import {
  BarChart3,
  Boxes,
  Check,
  FileText,
  FolderTree,
  Globe,
  House,
  Images,
  LayoutGrid,
  Megaphone,
  Package,
  PenLine,
  Rss,
  Search,
  Settings,
  ShoppingBag,
  UserPen,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BUSINESS_TYPE_GLYPH } from "@/content/business-types";

const ICONS: Record<AreaKey, LucideIcon> = {
  home: House,
  orders: ShoppingBag,
  products: Package,
  inventory: Boxes,
  customers: Users,
  website: Globe,
  pages: FileText,
  posts: PenLine,
  categories: FolderTree,
  authors: UserPen,
  projects: LayoutGrid,
  blog: Rss,
  media: Images,
  marketing: Megaphone,
  analytics: BarChart3,
  settings: Settings,
};

const owner = ROLE_PERMISSIONS.OWNER;

function navFor(type: BusinessType) {
  return storeNavigation(type, owner, () => true);
}

export function DashboardPreview({ type, className }: { type: BusinessType; className?: string }) {
  const definition = BUSINESS_TYPE_DEFINITIONS[type];
  const nav = navFor(type);
  return (
    <div
      role="img"
      aria-label={`The Storevia dashboard for ${definition.label.toLowerCase()}: navigation for ${nav
        .map((n) => n.label)
        .join(", ")}.`}
      className={cn(
        "overflow-hidden rounded-panel border border-line bg-canvas shadow-[var(--shadow-popover)]",
        className,
      )}
    >
      <div aria-hidden="true" className="flex min-h-[420px] text-left">
        <div className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface p-3 sm:flex">
          <div className="flex items-center gap-2 px-1.5 py-1">
            <span className="flex size-6 items-center justify-center rounded-[7px] bg-brand-600 text-[11px] font-bold text-white">
              S
            </span>
            <span className="text-[13px] font-semibold">Storevia</span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-control px-1.5 py-1.5">
            <span className="flex size-6 items-center justify-center rounded-[6px] bg-brand-50 text-[10px] font-semibold text-brand-700">
              YS
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold">Your store</span>
              <span className="block truncate text-[10px] text-ink-faint">{definition.label}</span>
            </span>
          </div>
          <ul className="mt-3 space-y-0.5">
            {nav.map((item, index) => {
              const Icon = ICONS[item.key];
              return (
                <li
                  key={item.key}
                  className={cn(
                    "flex h-7 items-center gap-2 rounded-[6px] px-2 text-[12px] font-medium",
                    index === 0 ? "bg-subtle text-ink" : "text-ink-muted",
                  )}
                >
                  <Icon
                    strokeWidth={ICON_STROKE}
                    className={cn("size-3.5", index === 0 ? "text-brand-700" : "text-ink-faint")}
                  />
                  {item.label}
                  {item.availability ? (
                    <span className="ml-auto text-[9px] text-ink-faint">Soon</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-11 items-center justify-between border-b border-line px-4">
            <span className="text-[12px] text-ink-muted">
              Your organisation <span className="text-ink-faint">/</span>{" "}
              <span className="font-medium text-ink">Your store</span>
            </span>
            <span className="hidden h-7 w-40 items-center gap-1.5 rounded-[6px] border border-line bg-surface px-2 text-[11px] text-ink-faint md:flex">
              <Search strokeWidth={ICON_STROKE} className="size-3" /> Search or jump to…
            </span>
          </div>
          <div className="p-4 sm:p-6">
            <span className="flex items-center gap-2 text-[12px] text-ink-muted">
              <GlyphTile name={BUSINESS_TYPE_GLYPH[type]} size="sm" className="size-7" />
              {definition.label}
            </span>
            <p className="mt-2 text-lg font-semibold tracking-tight">Your store</p>
            <div className="mt-4 rounded-card border border-line bg-surface shadow-xs">
              <div className="border-b border-line px-4 py-3">
                <p className="text-[13px] font-semibold">Get set up</p>
              </div>
              <ul className="divide-y divide-line px-4">
                {[
                  ["Create your store", true],
                  ["Check your store details", false],
                  ["Invite your team", false],
                ].map(([label, done]) => (
                  <li key={String(label)} className="flex items-center gap-3 py-2.5 text-[12px]">
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full",
                        done
                          ? "bg-brand-600 text-white"
                          : "border border-dashed border-line-strong",
                      )}
                    >
                      {done ? <Check strokeWidth={3} className="size-2.5" /> : null}
                    </span>
                    <span className="font-medium">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {definition.homeFocus.map((key) => {
                const Icon = ICONS[key];
                const area = nav.find((n) => n.key === key);
                return (
                  <div
                    key={key}
                    className="rounded-card border border-line bg-surface p-3 shadow-xs"
                  >
                    <Icon strokeWidth={ICON_STROKE} className="size-4 text-ink-muted" />
                    <p className="mt-2 truncate text-[12px] font-medium">{area?.label ?? key}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The phone layout: compact header and the business type's bottom bar. */
export function PhonePreview({ type, className }: { type: BusinessType; className?: string }) {
  const definition = BUSINESS_TYPE_DEFINITIONS[type];
  const primary = navFor(type)
    .filter((n) => n.primaryOnMobile)
    .slice(0, 3);
  return (
    <div
      role="img"
      aria-label={`The Storevia dashboard on a phone, with ${primary
        .map((n) => n.label)
        .join(", ")} in the bottom bar.`}
      className={cn(
        "w-[260px] overflow-hidden rounded-[2.25rem] border-[6px] border-stone-900 bg-canvas shadow-[var(--shadow-popover)]",
        className,
      )}
    >
      <div aria-hidden="true" className="flex h-[500px] flex-col text-left">
        <div className="flex h-12 items-center gap-2 border-b border-line bg-surface px-3">
          <span className="flex size-6 items-center justify-center rounded-[6px] bg-brand-50 text-[10px] font-semibold text-brand-700">
            YS
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold">Your store</span>
            <span className="block truncate text-[10px] text-ink-faint">{definition.label}</span>
          </span>
          <Search strokeWidth={ICON_STROKE} className="size-4 text-ink-muted" />
        </div>
        <div className="flex-1 space-y-3 p-3">
          <p className="text-[15px] font-semibold tracking-tight">Your store</p>
          {["Create your store", "Check your store details", "Invite your team"].map(
            (label, index) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-3 text-[12px] font-medium shadow-xs"
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full",
                    index === 0
                      ? "bg-brand-600 text-white"
                      : "border border-dashed border-line-strong",
                  )}
                >
                  {index === 0 ? <Check strokeWidth={3} className="size-2.5" /> : null}
                </span>
                {label}
              </div>
            ),
          )}
        </div>
        <div className="grid grid-cols-4 border-t border-line bg-surface">
          {primary.map((item, index) => {
            const Icon = ICONS[item.key];
            return (
              <span
                key={item.key}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium",
                  index === 0 ? "text-brand-700" : "text-ink-muted",
                )}
              >
                <Icon strokeWidth={ICON_STROKE} className="size-[18px]" />
                {item.label}
              </span>
            );
          })}
          <span className="flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium text-ink-muted">
            <LayoutGrid strokeWidth={ICON_STROKE} className="size-[18px]" />
            More
          </span>
        </div>
      </div>
    </div>
  );
}
