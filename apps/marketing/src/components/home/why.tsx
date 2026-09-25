// 04 Why Storevia: seven reasons as a bento of tiles, each with a small
// visual drawn from the product itself (its business types, roles, command
// menu and layouts). Decorative visuals; the words carry the meaning.
import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { MEMBER_ROLES, ROLE_LABELS } from "@storevia/tenancy/rbac";
import { cn } from "@storevia/ui/cn";
import { CommandMenuPreview } from "@storevia/ui/command-preview";
import { Glyph, Icon } from "@storevia/ui/icons";
import { Reveal } from "@storevia/ui/motion";
import { Avatar, Badge } from "@storevia/ui/surfaces";
import { Database, FileText, Lock, Package, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Section, SectionHeading, StatusPill } from "@/components/marketing";
import { BUSINESS_TYPE_GLYPH } from "@/content/business-types";
import { capability } from "@/content/capabilities";
import { SAMPLE_DASHBOARDS, SAMPLE_ORGANISATION } from "@/components/product/sample-data";

const TILE = "flex h-full flex-col overflow-hidden rounded-panel border border-line bg-surface";

/**
 * A reason: the visual on a sunken panel, then its title, words and status.
 * A Reveal list item; `delay` staggers tiles that enter together.
 */
function Tile({
  title,
  children,
  visual,
  className,
  footer,
  delay,
}: {
  title: string;
  children: ReactNode;
  visual: ReactNode;
  className?: string;
  footer?: ReactNode;
  delay?: number;
}) {
  return (
    <Reveal as="li" delay={delay} className={cn(TILE, className)}>
      <div
        aria-hidden="true"
        inert
        className="relative flex h-40 items-center justify-center overflow-hidden border-b border-line bg-surface-sunken px-6 sm:h-52"
      >
        {visual}
      </div>
      <div className="flex flex-1 flex-col p-6 lg:p-7">
        <h3 className="font-display text-h4 text-ink">{title}</h3>
        <p className="mt-2 text-body-sm text-ink-muted">{children}</p>
        {footer ? <div className="mt-auto pt-5">{footer}</div> : null}
      </div>
    </Reveal>
  );
}

/** An organisation holding three stores of different types, one plan. */
function OrganisationTree() {
  const stores = (["ECOMMERCE", "BUSINESS", "PUBLISHING"] as const).map((type) => ({
    type,
    name: SAMPLE_DASHBOARDS[type].store,
  }));
  return (
    <div className="flex w-full max-w-md flex-col items-center">
      <div className="flex items-center gap-2.5 rounded-card border border-line bg-surface py-2 pr-3 pl-2 shadow-card">
        <Avatar name={SAMPLE_ORGANISATION} shape="square" size="sm" />
        <span className="text-label text-ink">{SAMPLE_ORGANISATION}</span>
        <Badge size="sm" tone="brand">
          One plan
        </Badge>
      </div>
      <svg viewBox="0 0 300 28" className="h-7 w-[75%] text-line-strong" fill="none">
        <path
          d="M150 0v14M50 28v-8a6 6 0 0 1 6-6h188a6 6 0 0 1 6 6v8M150 14v14"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <ul className="grid w-full grid-cols-3 gap-2">
        {stores.map((store) => (
          <li
            key={store.type}
            className="flex min-w-0 flex-col items-center gap-1.5 rounded-control border border-line bg-surface px-2 py-2.5 text-center shadow-xs"
          >
            <Glyph name={BUSINESS_TYPE_GLYPH[store.type]} className="size-5 text-ink" />
            <span className="w-full truncate text-[11px] font-medium text-ink">{store.name}</span>
            <span className="w-full truncate text-[10px] text-ink-faint">
              {BUSINESS_TYPE_DEFINITIONS[store.type].label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The four business types, one chosen. */
function TypeChoices() {
  return (
    <ul className="grid w-full max-w-xs gap-1.5">
      {BUSINESS_TYPES.map((type, index) => (
        <li
          key={type}
          className={cn(
            "flex items-center gap-2.5 rounded-control border bg-surface px-3 py-2 text-[12px] text-ink",
            index === 0 ? "border-brand-500 ring-1 ring-brand-500" : "border-line",
          )}
        >
          <Glyph name={BUSINESS_TYPE_GLYPH[type]} className="size-4.5" />
          <span className="flex-1 font-medium">{BUSINESS_TYPE_DEFINITIONS[type].label}</span>
          <span
            className={cn(
              "size-3.5 rounded-full border",
              index === 0 ? "border-4 border-brand-600" : "border-line-control",
            )}
          />
        </li>
      ))}
    </ul>
  );
}

/** The ⌘K command menu, filtered. */
function Command() {
  return (
    <CommandMenuPreview
      query="pro"
      className="w-[22rem] max-w-none translate-y-6 scale-[0.86] shadow-popover"
      items={[
        {
          id: "products",
          label: "Products",
          group: "Go to",
          hint: "Northwind Studio",
          icon: <Icon icon={Package} size="sm" />,
        },
        {
          id: "profile",
          label: "Profile",
          group: "Go to",
          hint: "Account",
          icon: <Icon icon={Settings} size="sm" />,
        },
        {
          id: "projects",
          label: "Projects",
          group: "Go to",
          hint: "Northwind Design",
          icon: <Icon icon={FileText} size="sm" />,
        },
      ]}
    />
  );
}

/** Desktop, tablet and phone layouts as wireframes. */
function Devices() {
  const bar = "rounded-xs bg-neutral-200";
  return (
    <div className="flex items-end gap-3">
      <div className="flex h-28 w-40 overflow-hidden rounded-control border border-line-strong bg-surface shadow-xs">
        <div className="w-9 space-y-1.5 border-r border-line p-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={cn("block h-1.5", bar, i === 0 && "bg-brand-400")} />
          ))}
        </div>
        <div className="flex-1 space-y-1.5 p-2">
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-5 rounded-xs border border-line" />
            ))}
          </div>
          <span className="block h-11 rounded-xs border border-line" />
        </div>
      </div>
      <div className="flex h-24 w-20 overflow-hidden rounded-control border border-line-strong bg-surface shadow-xs">
        <div className="w-4 space-y-1.5 border-r border-line px-1 py-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn("block size-2 rounded-full bg-neutral-200", i === 0 && "bg-brand-400")}
            />
          ))}
        </div>
        <div className="flex-1 space-y-1 p-1.5">
          <div className="grid grid-cols-2 gap-1">
            {[0, 1].map((i) => (
              <span key={i} className="h-4 rounded-xs border border-line" />
            ))}
          </div>
          <span className="block h-9 rounded-xs border border-line" />
        </div>
      </div>
      <div className="flex h-20 w-11 flex-col overflow-hidden rounded-[0.6rem] border border-line-strong bg-surface shadow-xs">
        <div className="flex-1 space-y-1 p-1">
          <span className="block h-3.5 rounded-xs border border-line" />
          <span className="block h-3.5 rounded-xs border border-line" />
        </div>
        <div className="flex h-3.5 items-center justify-around border-t border-line px-0.5">
          <span className="size-1 rounded-full bg-brand-500" />
          <span className="size-1 rounded-full bg-neutral-300" />
          <span className="size-1.5 rounded-[2px] bg-brand-600" />
          <span className="size-1 rounded-full bg-neutral-300" />
        </div>
      </div>
    </div>
  );
}

/** People and their roles. */
function People() {
  const people = [
    { name: "Amara Okafor", role: ROLE_LABELS.OWNER },
    { name: "Jonas Weber", role: ROLE_LABELS.STORE_MANAGER },
    { name: "Mei Tanaka", role: ROLE_LABELS.AUTHOR },
  ];
  return (
    <ul className="w-full max-w-xs divide-y divide-line rounded-card border border-line bg-surface shadow-card">
      {people.map((person) => (
        <li key={person.name} className="flex items-center gap-2.5 px-3 py-2.5">
          <Avatar name={person.name} size="sm" />
          <span className="flex-1 truncate text-[12px] font-medium text-ink">{person.name}</span>
          <Badge size="sm" variant="outline">
            {person.role}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Two organisations' data, kept apart in the database. */
function Isolation() {
  const lane = (name: string, muted = false) => (
    <div
      className={cn(
        "w-28 rounded-card border border-line bg-surface p-3 shadow-xs sm:w-36",
        muted && "opacity-70",
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
        <Icon icon={Database} size="xs" className="text-ink-faint" />
        {name}
      </p>
      <div className="mt-2.5 space-y-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-2 rounded-xs bg-neutral-200"
            style={{ width: `${String(90 - i * 18)}%` }}
          />
        ))}
      </div>
    </div>
  );
  return (
    <div className="flex items-center gap-3">
      {lane(SAMPLE_ORGANISATION)}
      <div className="flex flex-col items-center gap-1.5">
        <span className="h-8 w-px bg-line-strong" />
        <span className="flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface text-ink shadow-xs">
          <Icon icon={Lock} size="sm" />
        </span>
        <span className="h-8 w-px bg-line-strong" />
      </div>
      {lane("Another business", true)}
    </div>
  );
}

/** Online and in person, joined by a dashed (future) line. */
function Omnichannel() {
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-14 items-center justify-center rounded-card border border-line bg-surface shadow-xs">
        <Glyph name="online-store" className="size-7 text-ink" />
      </span>
      <span className="w-20 border-t-[1.5px] border-dashed border-line-control" />
      <span className="flex size-14 items-center justify-center rounded-card border border-dashed border-line-control bg-surface">
        <Glyph name="retail" accent="none" className="size-7 text-ink-faint" />
      </span>
    </div>
  );
}

export function WhyStorevia() {
  const teams = capability("teams");
  return (
    <Section tone="tinted" labelledBy="why-heading">
      <SectionHeading
        id="why-heading"
        eyebrow="Why Storevia"
        title="Built to be the one place your business runs from"
        lead="Storevia puts the foundations first: one account for everything you run, access that fits each person, and a workspace designed for every screen."
      />
      <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:mt-14 lg:grid-cols-12 lg:gap-5">
        <Tile
          title="One platform"
          visual={<OrganisationTree />}
          className="lg:col-span-7"
          footer={<StatusPill status="available" />}
        >
          An organisation holds every store and site you run, of any type, on one plan. Switch
          between them in a click.
        </Tile>
        <Tile
          title="Flexible business types"
          visual={<TypeChoices />}
          className="lg:col-span-5"
          delay={80}
          footer={<StatusPill status="available" />}
        >
          Tell Storevia what you&apos;re building. Navigation, your store&apos;s home and suggested
          roles adapt, and you can change it at any time.
        </Tile>
        <Tile
          title="Powerful administration"
          visual={<Command />}
          className="lg:col-span-4"
          footer={<StatusPill status="available" />}
        >
          Breadcrumbs, a store switcher and a ⌘K command menu that jumps to any page.
        </Tile>
        <Tile
          title="Responsive management"
          visual={<Devices />}
          className="lg:col-span-4"
          delay={80}
          footer={<StatusPill status={capability("administration").status} />}
        >
          A sidebar on desktop, a touch rail on tablet and an app-style bottom bar on your phone.
        </Tile>
        <Tile
          title="Role-based collaboration"
          visual={<People />}
          className="md:col-span-2 lg:col-span-4"
          delay={160}
          footer={<StatusPill status={teams.status} />}
        >
          {MEMBER_ROLES.length} standard roles, each mapped to precise permissions and checked on
          every request.
        </Tile>
        <Tile
          title="Scalable architecture"
          visual={<Isolation />}
          className="lg:col-span-6"
          footer={<StatusPill status="available" />}
        >
          Each organisation&apos;s data is isolated in the database itself, and every request is
          checked against the member&apos;s role.
        </Tile>
        <Tile
          title="Future omnichannel"
          visual={<Omnichannel />}
          className="lg:col-span-6"
          delay={80}
          footer={<StatusPill status={capability("retail").status} />}
        >
          Selling in person is a future direction for the Storevia ecosystem, for shops that sell
          online and in store.
        </Tile>
      </ul>
    </Section>
  );
}
