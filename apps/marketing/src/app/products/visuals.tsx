// Small product compositions for /products, built from the design system and
// the shared mockup frames (components/product). Each one is a single
// labelled, inert image; any that shows a figure or a name says it's
// illustrative. Server components.
import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { ROLE_LABELS } from "@storevia/tenancy/rbac";
import { cn } from "@storevia/ui/cn";
import { CommandMenuPreview } from "@storevia/ui/command-preview";
import { Kbd, UsageMeter } from "@storevia/ui/data";
import { Glyph, Icon } from "@storevia/ui/icons";
import { Avatar, Badge } from "@storevia/ui/surfaces";
import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  Globe,
  History,
  ImageUp,
  Lock,
  MapPin,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { IllustrativeNote, Mockup } from "@/components/product/frame";
import { PhoneAdmin } from "@/components/product/phone-admin";
import { ProductArt } from "@/components/product/product-art";
import {
  SAMPLE_DASHBOARDS,
  SAMPLE_ORGANISATION,
  SAMPLE_PERSON,
  SAMPLE_PRODUCTS,
} from "@/components/product/sample-data";
import { StorefrontPreview } from "@/components/product/storefront-preview";
import { BUSINESS_TYPE_GLYPH } from "@/content/business-types";

/** An organisation's store switcher: one store of each type, and the plan's store limit. */
export function OrganisationVisual() {
  return (
    <div>
      <Mockup
        label={`Illustration: the store switcher for a sample organisation, ${SAMPLE_ORGANISATION}, with one store of each business type and its plan's store limit.`}
        className="rounded-panel border border-line bg-surface-sunken p-5 sm:p-8"
      >
        <div className="mx-auto max-w-md overflow-hidden rounded-card border border-line bg-surface shadow-popover">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Avatar name={SAMPLE_ORGANISATION} shape="square" size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label text-ink">{SAMPLE_ORGANISATION}</span>
              <span className="block text-caption text-ink-faint">Organisation</span>
            </span>
            <Icon icon={ChevronsUpDown} size="sm" className="text-ink-faint" />
          </div>
          <p className="px-4 pt-3 pb-1 text-overline text-ink-faint uppercase">Stores</p>
          <ul className="px-2 pb-2">
            {BUSINESS_TYPES.map((type, index) => (
              <li
                key={type}
                className={
                  index === 0
                    ? "flex items-center gap-3 rounded-control bg-subtle px-2 py-2"
                    : "flex items-center gap-3 px-2 py-2"
                }
              >
                <span className="flex size-8 items-center justify-center rounded-control border border-line bg-surface">
                  <Glyph name={BUSINESS_TYPE_GLYPH[type]} className="size-4.5 text-ink" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {SAMPLE_DASHBOARDS[type].store}
                  </span>
                  <span className="block text-caption text-ink-muted">
                    {BUSINESS_TYPE_DEFINITIONS[type].label}
                  </span>
                </span>
                {index === 0 ? <Icon icon={Check} size="sm" className="text-brand-600" /> : null}
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3.5">
            <UsageMeter label="Stores on your plan" used={4} limit={10} size="sm" />
          </div>
          <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-body-sm text-ink-muted">
            <Icon icon={Plus} size="sm" />
            Create a store
          </div>
        </div>
      </Mockup>
      <IllustrativeNote className="mt-4">
        Illustrative: a sample organisation. Your plan sets how many stores you can run.
      </IllustrativeNote>
    </div>
  );
}

/**
 * The phone layout with the ⌘K command menu floating over its edge: one
 * workspace, every screen. The phone keeps the width its layout is drawn for
 * (13.5rem); the menu, a keyboard feature, joins it only where both fit.
 */
export function AdministrationVisual() {
  return (
    <Mockup
      label="Illustration: the dashboard's phone layout with example figures, beside the Storevia command menu searching pages and stores."
      className="@container/admin rounded-panel border border-line bg-surface-sunken p-5 sm:p-8"
    >
      <div className="flex items-center justify-center">
        <PhoneAdmin className="relative w-[13.5rem] shrink-0" />
        <div className="relative z-10 -ml-10 hidden max-w-[26rem] min-w-0 flex-1 @[36rem]/admin:block">
          <CommandMenuPreview
            query="st"
            className="max-w-none shadow-popover"
            items={[
              {
                id: "store",
                label: SAMPLE_DASHBOARDS.ECOMMERCE.store,
                group: "Stores",
                hint: BUSINESS_TYPE_DEFINITIONS.ECOMMERCE.label,
                icon: <Glyph name="online-store" className="size-4" />,
              },
              {
                id: "journal",
                label: SAMPLE_DASHBOARDS.PUBLISHING.store,
                group: "Stores",
                hint: BUSINESS_TYPE_DEFINITIONS.PUBLISHING.label,
                icon: <Glyph name="publishing" className="size-4" />,
              },
              {
                id: "settings",
                label: "Store settings",
                group: "Go to",
                icon: <Icon icon={Settings} size="sm" />,
              },
              {
                id: "members",
                label: "Members",
                group: "Go to",
                hint: "Team",
                keywords: ["staff"],
                icon: <Icon icon={Users} size="sm" />,
              },
            ]}
          />
        </div>
      </div>
      <p className="mt-6 hidden flex-wrap items-center justify-center gap-2 text-caption text-ink-muted @[36rem]/admin:flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
        <span>or</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
        <span>from anywhere</span>
      </p>
    </Mockup>
  );
}

/** A domain being connected: verification, then HTTPS (a roadmap concept). */
export function DomainsVignette() {
  return (
    <Mockup
      label="Illustration: a custom domain connected to a store, verified and with HTTPS, a concept for a feature on the roadmap."
      className="w-full max-w-xs"
    >
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <Icon icon={Globe} size="sm" className="text-ink-faint" />
          <span className="min-w-0 flex-1 truncate text-label text-ink">northwind.example</span>
          <Badge tone="success" size="sm" dot>
            Verified
          </Badge>
        </div>
        <div className="flex items-center gap-2.5 border-t border-line px-3.5 py-2.5 text-caption text-ink-muted">
          <Icon icon={Lock} size="xs" />
          HTTPS certificate renews automatically
        </div>
      </div>
    </Mockup>
  );
}

/** A theme's colours and type, being adjusted (a roadmap concept). */
export function ThemesVignette() {
  const swatches = ["bg-navy-950", "bg-brand-600", "bg-accent-400", "bg-neutral-100"];
  return (
    <Mockup
      label="Illustration: a theme's colours and type styles, a concept for a feature on the roadmap."
      className="w-full max-w-xs"
    >
      <div className="flex items-center gap-4 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card">
        <span className="font-display text-[2rem] leading-none font-semibold tracking-tight text-ink">
          Aa
        </span>
        <span className="h-8 w-px bg-line" />
        <span className="flex gap-1.5">
          {swatches.map((swatch, index) => (
            <span
              key={swatch}
              className={cn(
                "size-6 rounded-full ring-1 ring-line",
                swatch,
                index === 1 && "ring-2 ring-brand-600 ring-offset-2",
              )}
            />
          ))}
        </span>
      </div>
    </Mockup>
  );
}

/** A customer record (a roadmap concept, a sample person). */
export function CustomersVignette() {
  return (
    <Mockup
      label="Illustration: a sample customer record, a concept for a feature on the roadmap."
      className="w-full max-w-xs"
    >
      <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 shadow-card">
        <Avatar name="Leo Hart" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-label text-ink">Leo Hart</span>
          <span className="block truncate text-caption text-ink-faint">leo@example.com</span>
        </span>
        <Icon icon={ChevronRight} size="sm" className="text-ink-faint" />
      </div>
    </Mockup>
  );
}

/** An API key and an event delivery (a roadmap concept). */
export function IntegrationsVignette() {
  return (
    <Mockup
      label="Illustration: an API key and a webhook endpoint, a concept for a feature on the roadmap."
      className="w-full max-w-xs"
    >
      <div className="overflow-hidden rounded-card border border-line bg-surface font-mono text-[12px] shadow-card">
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="text-ink-muted">API key</span>
          <span className="text-ink">••••••••••••</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-3.5 py-2.5">
          <span className="text-ink-muted">Webhook</span>
          <span className="min-w-0 truncate text-ink">https://example.com/hooks</span>
        </div>
      </div>
    </Mockup>
  );
}

// ---------------------------------------------------------------------------
// Commerce, part by part (up next): the catalogue's model, the stock ledger
// and the media pipeline, each with one sample product.
// ---------------------------------------------------------------------------

const APRON = SAMPLE_PRODUCTS.find((product) => product.art === "apron") ?? SAMPLE_PRODUCTS[0];

const APRON_OPTIONS = [
  { name: "Colour", values: ["Sand", "Charcoal"] },
  { name: "Size", values: ["S–M", "L–XL"] },
] as const;

const APRON_VARIANTS = [
  { name: "Sand · S–M", sku: "APR-SA-SM", price: "$47.00", stock: 31 },
  { name: "Sand · L–XL", sku: "APR-SA-LX", price: "$47.00", stock: 12 },
  { name: "Charcoal · S–M", sku: "APR-CH-SM", price: "$49.00", stock: 7 },
  { name: "Charcoal · L–XL", sku: "APR-CH-LX", price: "$49.00", stock: 0 },
] as const;

/** A step of the model: a small numbered label over a card. */
function ModelStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <p className="flex items-center gap-2 text-caption font-medium text-ink-muted">
        <span className="flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface text-[10.5px] font-semibold text-ink tabular-nums">
          {n}
        </span>
        {title}
      </p>
      <div className="mt-3 flex-1 rounded-card border border-line bg-surface shadow-xs">
        {children}
      </div>
    </div>
  );
}

/** One product, two options, four variants: how the catalogue is modelled. */
export function CatalogueModelVisual() {
  return (
    <Mockup
      label={`Illustration: a sample product, ${APRON?.name ?? "a linen apron"}, with two options (colour and size) that make four variants, each with its own SKU, price and stock.`}
      className="@container/model rounded-panel border border-line bg-surface-sunken p-4 sm:p-6"
    >
      <div className="grid gap-4 @2xl/model:grid-cols-[minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <ModelStep n={1} title="Product">
          <div className="flex items-center gap-3 p-3 @2xl/model:flex-col @2xl/model:items-start">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-control bg-surface-sunken @2xl/model:size-24">
              {APRON ? <ProductArt kind={APRON.art} className="size-4/5" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-label text-ink">{APRON?.name}</span>
              <span className="block text-caption text-ink-muted">2 options · 4 variants</span>
            </span>
          </div>
        </ModelStep>
        <ModelStep n={2} title="Options">
          <ul className="divide-y divide-line">
            {APRON_OPTIONS.map((option) => (
              <li key={option.name} className="px-3 py-3">
                <p className="text-caption text-ink-muted">{option.name}</p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {option.values.map((value) => (
                    <Badge key={value} size="sm" variant="outline">
                      {value}
                    </Badge>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </ModelStep>
        <ModelStep n={3} title="Variants">
          <ul className="divide-y divide-line">
            {APRON_VARIANTS.map((variant) => (
              <li
                key={variant.sku}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {variant.name}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-faint">{variant.sku}</span>
                </span>
                <span className="text-body-sm text-ink tabular-nums">{variant.price}</span>
                <span className="w-16 text-right text-body-sm tabular-nums">
                  {variant.stock === 0 ? (
                    <Badge tone="danger" size="sm">
                      Out
                    </Badge>
                  ) : (
                    <span className={variant.stock < 10 ? "text-warning-700" : "text-ink"}>
                      {variant.stock} left
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </ModelStep>
      </div>
    </Mockup>
  );
}

/** Newest first; each balance follows from the one below it. */
const MOVEMENTS = [
  { when: "Today", reason: "Order #1042", change: -2, balance: 31 },
  { when: "Mon", reason: "Stock count", change: -1, balance: 33 },
  { when: "12 Sep", reason: "Order #1031", change: -2, balance: 34 },
  { when: "2 Sep", reason: "Received from supplier", change: 36, balance: 36 },
] as const;

/** The stock ledger for one variant at one location: every change on the record. */
export function StockLedgerVisual() {
  return (
    <Mockup
      label="Illustration: the stock history of one sample variant at one location, with every change and the balance after it."
      className="@container/ledger"
    >
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          <span className="min-w-0">
            <span className="block truncate text-label text-ink">Sand · S–M</span>
            <span className="flex items-center gap-1.5 text-caption text-ink-muted">
              <Icon icon={MapPin} size="xs" />
              Studio
            </span>
          </span>
          <span className="text-right">
            <span className="block font-display text-h4 text-ink tabular-nums">31</span>
            <span className="block text-caption text-ink-faint">on hand</span>
          </span>
        </div>
        <ol className="divide-y divide-line">
          {MOVEMENTS.map((movement) => (
            <li
              key={`${movement.when}-${movement.reason}`}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto_2.5rem] items-center gap-x-3 px-4 py-2.5 text-body-sm"
            >
              <span className="text-caption text-ink-faint">{movement.when}</span>
              <span className="min-w-0 truncate text-ink">{movement.reason}</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  movement.change > 0 ? "text-success-700" : "text-ink-muted",
                )}
              >
                {movement.change > 0
                  ? `+${String(movement.change)}`
                  : `−${String(-movement.change)}`}
              </span>
              <span className="text-right text-ink tabular-nums">{movement.balance}</span>
            </li>
          ))}
        </ol>
      </div>
    </Mockup>
  );
}

/** An upload on its way into the media library: checked, then resized. */
export function MediaPipelineVisual() {
  const renditions = [
    { px: "2400", size: "size-24" },
    { px: "1200", size: "size-18" },
    { px: "600", size: "size-13" },
    { px: "300", size: "size-9" },
  ];
  return (
    <Mockup
      label="Illustration: an image uploaded to the media library, checked, then resized into smaller copies for every screen."
      className="@container/media"
    >
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Icon icon={ImageUp} size="sm" className="text-ink-faint" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
            apron-sand.jpg
          </span>
          <Badge tone="success" size="sm" dot>
            Checked
          </Badge>
        </div>
        <div className="flex items-end justify-center gap-3 bg-surface-sunken px-4 pt-6 pb-5 sm:gap-5">
          {renditions.map((rendition) => (
            <span key={rendition.px} className="flex flex-col items-center gap-2">
              <span
                className={cn(
                  "flex items-center justify-center rounded-control border border-line bg-surface",
                  rendition.size,
                )}
              >
                {APRON ? <ProductArt kind={APRON.art} className="size-4/5" /> : null}
              </span>
              <span className="text-[11px] text-ink-faint tabular-nums">{rendition.px} px</span>
            </span>
          ))}
        </div>
      </div>
    </Mockup>
  );
}

// ---------------------------------------------------------------------------
// Website builder (roadmap): one page on two screens, and its history.
// ---------------------------------------------------------------------------

const VERSIONS = [
  { label: "Draft", detail: "Autosaved just now", state: "draft" },
  { label: "Published", detail: "Today, 09:40", state: "live" },
  { label: "Version 2", detail: "Mon, 16:05", state: "earlier" },
  { label: "Version 1", detail: "2 Sep, 11:20", state: "earlier" },
] as const;

/** A page's history: the draft, what's live and earlier versions to restore. */
function PageHistory({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-line bg-surface shadow-popover",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <Icon icon={History} size="sm" className="text-ink-faint" />
        <span className="text-label text-ink">Home page history</span>
      </div>
      <ol className="px-3.5 py-1.5">
        {VERSIONS.map((version) => (
          <li key={version.label} className="flex items-center gap-3 py-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                version.state === "draft" && "border-2 border-brand-600",
                version.state === "live" && "bg-success-500",
                version.state === "earlier" && "bg-neutral-300",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-medium text-ink">{version.label}</span>
              <span className="block text-caption text-ink-faint">{version.detail}</span>
            </span>
            {version.state === "earlier" ? (
              <span className="text-caption font-medium text-brand-700">Restore</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The same page at desktop and phone width, with its version history. */
export function PublishingVisual() {
  return (
    <Mockup
      label="Illustration: one sample storefront page shown at desktop and phone width, beside its history of drafts and published versions, a concept for a feature on the roadmap."
      className="@container/publish rounded-panel border border-line bg-surface-sunken p-4 sm:p-8"
    >
      <div className="grid items-start gap-5 @2xl/publish:grid-cols-[minmax(0,1fr)_15rem] @2xl/publish:gap-8">
        <div className="relative min-w-0 @4xl/publish:pr-24">
          <StorefrontPreview className="h-[20rem] @4xl/publish:h-[24rem]" />
          <div className="absolute -right-2 -bottom-4 hidden w-[11.5rem] @4xl/publish:block">
            <StorefrontPreview products={2} className="h-[19rem] shadow-window" />
          </div>
        </div>
        <div className="max-w-sm">
          <PageHistory />
        </div>
      </div>
    </Mockup>
  );
}

// ---------------------------------------------------------------------------
// Content (roadmap): a post's path from author to editor to published.
// ---------------------------------------------------------------------------

const STAGES = [
  {
    stage: "Draft",
    role: "AUTHOR",
    posts: [
      { title: "Caring for linen", by: "Leo Hart", tag: "Guides" },
      { title: "Inside the kiln", by: "Mia Chen", tag: "Studio" },
    ],
  },
  {
    stage: "In review",
    role: "EDITOR",
    posts: [{ title: "A field guide to slow mornings", by: SAMPLE_PERSON.name, tag: "Guides" }],
  },
  {
    stage: "Published",
    role: "EDITOR",
    posts: [
      { title: "Autumn studio notes", by: "Leo Hart", tag: "News" },
      { title: "Meet the makers", by: "Mia Chen", tag: "Stories" },
    ],
  },
] as const;

/** Posts moving from draft to review to published, with the role at each step. */
export function EditorialFlowVisual() {
  return (
    <Mockup
      label="Illustration: sample posts moving from draft (written by authors) to review and publishing (by editors), a concept for a feature on the roadmap."
      className="@container/flow rounded-panel border border-line bg-surface-sunken p-4 sm:p-6"
    >
      <ol className="grid gap-4 @xl/flow:grid-cols-3">
        {STAGES.map((column) => (
          <li key={column.stage} className="flex min-w-0 flex-col">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-label text-ink">{column.stage}</span>
              <span className="text-caption text-ink-faint">{ROLE_LABELS[column.role]}</span>
            </div>
            <ul className="mt-3 flex-1 space-y-2.5">
              {column.posts.map((post) => (
                <li
                  key={post.title}
                  className="rounded-card border border-line bg-surface p-3.5 shadow-xs"
                >
                  <p className="text-[10.5px] font-semibold tracking-[0.08em] text-brand-700 uppercase">
                    {post.tag}
                  </p>
                  <p className="mt-1 text-body-sm font-medium text-ink">{post.title}</p>
                  <p className="mt-2.5 flex items-center gap-2 text-caption text-ink-muted">
                    <Avatar name={post.by} size="xs" />
                    {post.by}
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Mockup>
  );
}
