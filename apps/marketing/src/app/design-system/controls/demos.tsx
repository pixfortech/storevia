"use client";

// Interactive specimens for the controls gallery. All content is example
// content for the design system, not product data.
import {
  Breadcrumb,
  Button,
  ButtonGroup,
  Checkbox,
  ChoiceCards,
  Combobox,
  DateRangePicker,
  Dialog,
  DialogClose,
  Field,
  GlyphTile,
  IconButton,
  Input,
  Logo,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  Pagination,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Progress,
  RadioGroup,
  RadioItem,
  SearchInput,
  SegmentedControl,
  Select,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toaster,
  ToastProvider,
  Tooltip,
  TooltipProvider,
  useToast,
  cn,
  type ComboboxOption,
  type DateRangeValue,
  type GlyphName,
} from "@storevia/ui";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Bold,
  Copy,
  Globe,
  Italic,
  LayoutGrid,
  Link2,
  List,
  Search,
  Settings,
  Trash2,
  Underline,
} from "lucide-react";
import { useState, type ReactNode } from "react";

/** A specimen with a caption naming what it shows. */
export function Labeled({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-h-12 min-w-0 flex-wrap items-center gap-3">{children}</div>
      <p className="mt-3 text-caption text-ink-faint">{label}</p>
    </div>
  );
}

/* --- Buttons ------------------------------------------------------------------ */

export function PendingButtonDemo() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      pending={pending}
      onClick={() => {
        setPending(true);
        setTimeout(() => {
          setPending(false);
        }, 1800);
      }}
    >
      Save changes
    </Button>
  );
}

export function ToolbarDemo() {
  const [align, setAlign] = useState("left");
  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup aria-label="Text style">
          <IconButton variant="secondary" size="sm" icon={Bold} aria-label="Bold" />
          <IconButton variant="secondary" size="sm" icon={Italic} aria-label="Italic" />
          <IconButton variant="secondary" size="sm" icon={Underline} aria-label="Underline" />
        </ButtonGroup>
        <SegmentedControl
          aria-label="Text alignment"
          size="sm"
          value={align}
          onValueChange={setAlign}
          options={[
            { value: "left", label: null, icon: AlignLeft, "aria-label": "Align left" },
            { value: "center", label: null, icon: AlignCenter, "aria-label": "Align centre" },
            { value: "right", label: null, icon: AlignRight, "aria-label": "Align right" },
          ]}
        />
        <div className="flex items-center gap-1.5 pointer-coarse:gap-3.5">
          <Tooltip content="Copy link">
            <IconButton size="sm" icon={Link2} aria-label="Copy link" />
          </Tooltip>
          <Tooltip content="Settings">
            <IconButton size="sm" icon={Settings} aria-label="Settings" />
          </Tooltip>
          <Tooltip content="Delete">
            <IconButton size="sm" icon={Trash2} aria-label="Delete" />
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* --- Text fields --------------------------------------------------------------- */

export function InputDemos() {
  return (
    <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
      <Labeled label="Input · default" className="[&>div]:block">
        <Input aria-label="Store name" placeholder="Northwind Studio" />
      </Labeled>
      <Labeled label="Input · focus" className="[&>div]:block">
        <Input
          aria-label="Store name, focused example"
          defaultValue="Northwind Studio"
          className="border-brand-500 ring-3 ring-brand-100"
        />
      </Labeled>
      <Labeled label="Input · leadingIcon" className="[&>div]:block">
        <Input aria-label="Website address" leadingIcon={Globe} placeholder="northwind.example" />
      </Labeled>
      <Labeled label="Input · addon" className="[&>div]:block">
        <Input aria-label="Subdomain" defaultValue="northwind" addon=".storevia.site" />
      </Labeled>
      <Labeled label="Input · invalid" className="[&>div]:block">
        <Input aria-label="Email, invalid example" aria-invalid defaultValue="hello@northwind" />
      </Labeled>
      <Labeled label="Input · disabled" className="[&>div]:block">
        <Input aria-label="Store ID" value="st_8f2k1c" readOnly disabled />
      </Labeled>
    </div>
  );
}

export function SizeDemo() {
  return (
    <div className="grid gap-4">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div
          key={size}
          className="grid grid-cols-[2rem_minmax(0,1fr)_5.5rem] items-center gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_6rem]"
        >
          <span className="text-caption text-ink-faint">{size}</span>
          <Input size={size} aria-label={`Name, ${size}`} placeholder="Placeholder" />
          <Select
            size={size}
            aria-label={`Billing period, ${size}`}
            defaultValue="yearly"
            className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
          <Button
            size={size}
            variant="secondary"
            fullWidth
            className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
          >
            Apply
          </Button>
        </div>
      ))}
    </div>
  );
}

export function FieldDemos() {
  const [name, setName] = useState("");
  return (
    <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
      <Field
        label="Store name"
        required
        description="Shown in the browser tab and on invoices."
        error={name.trim().length === 1 ? "Use at least 2 characters." : undefined}
      >
        <Input
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
          placeholder="Northwind Studio"
        />
      </Field>
      <Field label="Work email" error="Enter an email address like name@company.com.">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            defaultValue="hello@northwind"
          />
        )}
      </Field>
      <Field label="Industry" optional description="Helps us suggest a starting layout.">
        <Select defaultValue="">
          <option value="" disabled>
            Choose an industry
          </option>
          <option>Fashion and apparel</option>
          <option>Food and drink</option>
          <option>Professional services</option>
        </Select>
      </Field>
      <Field
        label="Password"
        labelAside={
          <a
            href="#field"
            className="text-brand-700 hover:underline pointer-coarse:-my-3 pointer-coarse:py-3"
          >
            Forgot password?
          </a>
        }
      >
        <Input type="password" defaultValue="example-password" />
      </Field>
      <Field
        label="About the store"
        optional
        description="A sentence or two for search results."
        className="sm:col-span-2"
      >
        <Textarea placeholder="Small-batch ceramics, made in Lisbon." rows={3} />
      </Field>
    </div>
  );
}

/* --- Search and combobox --------------------------------------------------------- */

export function SearchDemo() {
  const [query, setQuery] = useState("Linen apron");
  return (
    <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
      <Labeled label="SearchInput · shortcut" className="[&>div]:block">
        <SearchInput
          aria-label="Search"
          placeholder="Search pages, orders, people…"
          shortcut="⌘K"
        />
      </Labeled>
      <Labeled label="SearchInput · with value (clear button)" className="[&>div]:block">
        <SearchInput
          aria-label="Search products"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </Labeled>
    </div>
  );
}

const CURRENCIES: readonly ComboboxOption[] = [
  { value: "usd", label: "US dollar", description: "USD · $", keywords: ["usd", "united states"] },
  { value: "eur", label: "Euro", description: "EUR · €", keywords: ["eur", "europe"] },
  { value: "gbp", label: "Pound sterling", description: "GBP · £", keywords: ["gbp", "uk"] },
  { value: "cad", label: "Canadian dollar", description: "CAD · $", keywords: ["cad"] },
  { value: "aud", label: "Australian dollar", description: "AUD · $", keywords: ["aud"] },
  { value: "jpy", label: "Japanese yen", description: "JPY · ¥", keywords: ["jpy"] },
  { value: "chf", label: "Swiss franc", description: "CHF", keywords: ["chf"] },
  { value: "sek", label: "Swedish krona", description: "SEK · kr", keywords: ["sek"] },
  { value: "inr", label: "Indian rupee", description: "INR · ₹", keywords: ["inr"] },
  {
    value: "brl",
    label: "Brazilian real",
    description: "BRL · R$",
    keywords: ["brl"],
    disabled: true,
  },
];

function currencyCaption(value: string | null): string {
  const option = CURRENCIES.find((item) => item.value === value);
  return option ? `Selected: ${option.label} (${option.value.toUpperCase()})` : "Nothing selected";
}

export function ComboboxDemo() {
  const [currency, setCurrency] = useState<string | null>("eur");
  return (
    <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
      <div className="grid content-start gap-3">
        <Field
          label="Store currency"
          description="Type to filter; arrow keys, Enter and Escape work."
        >
          <Combobox
            options={CURRENCIES}
            value={currency}
            onValueChange={setCurrency}
            placeholder="Choose a currency"
            name="currency"
          />
        </Field>
        <p aria-live="polite" className="text-caption text-ink-faint">
          {currencyCaption(currency)}
        </p>
      </div>
      <Labeled label="Combobox · in a Dialog: the list floats over the scrolling body">
        <ComboboxDialogDemo />
      </Labeled>
    </div>
  );
}

function ComboboxDialogDemo() {
  const [currency, setCurrency] = useState<string | null>("gbp");
  return (
    <Dialog
      trigger={<Button variant="secondary">Open store settings</Button>}
      title="Store settings"
      description="Example dialog. Nothing here is saved."
      size="sm"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save</Button>
          </DialogClose>
        </>
      }
    >
      <div className="grid gap-5">
        <Field label="Store name">
          <Input defaultValue="Northwind Studio" />
        </Field>
        <Field label="Currency" description="Used at checkout and on invoices.">
          <Combobox
            options={CURRENCIES}
            value={currency}
            onValueChange={setCurrency}
            placeholder="Choose a currency"
          />
        </Field>
      </div>
    </Dialog>
  );
}

/* --- Date range ---------------------------------------------------------------- */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const PRESET_NAMES = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
} as const;

/** "2026-09-01" → "1 Sep 2026", without Date (so no time-zone surprises). */
function formatDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "…";
  return `${String(day)} ${MONTHS[month - 1] ?? ""} ${String(year)}`;
}

function rangeCaption(range: DateRangeValue): string {
  if (range.preset !== "custom") return `Selected: ${PRESET_NAMES[range.preset]}`;
  return `Selected: ${formatDay(range.from)} – ${formatDay(range.to)}`;
}

export function DateRangeDemo() {
  const [range, setRange] = useState<DateRangeValue>({ preset: "30d" });
  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <DateRangePicker value={range} onValueChange={setRange} />
        <p aria-live="polite" className="text-caption text-ink-faint">
          {rangeCaption(range)}
        </p>
      </div>
      <Labeled label="DateRangePicker · sm, presets 7d / 30d / 90d, no custom">
        <DateRangePicker size="sm" presets={["7d", "30d", "90d"]} allowCustom={false} />
      </Labeled>
    </div>
  );
}

/* --- Selection ------------------------------------------------------------------- */

const CHANNELS = ["Email", "Push", "SMS"] as const;

export function CheckboxDemo() {
  const [picked, setPicked] = useState<readonly string[]>(["Email"]);
  const all = picked.length === CHANNELS.length;
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div className="grid gap-3">
        <Checkbox
          label="All channels"
          checked={all ? true : picked.length > 0 ? "indeterminate" : false}
          onCheckedChange={() => {
            setPicked(all ? [] : [...CHANNELS]);
          }}
        />
        <div className="grid gap-3 border-l border-line pl-4 ml-2">
          {CHANNELS.map((channel) => (
            <Checkbox
              key={channel}
              label={channel}
              checked={picked.includes(channel)}
              onCheckedChange={(checked) => {
                setPicked((current) =>
                  checked === true ? [...current, channel] : current.filter((c) => c !== channel),
                );
              }}
            />
          ))}
        </div>
        <p className="mt-1 text-caption text-ink-faint">Checkbox · checked, indeterminate</p>
      </div>
      <div className="grid content-start gap-4">
        <Checkbox
          defaultChecked
          label="Send order confirmations"
          description="A receipt email after each purchase."
        />
        <Checkbox label="Weekly summary" description="Available on paid plans." disabled />
        <p className="mt-1 text-caption text-ink-faint">Checkbox · description, disabled</p>
      </div>
    </div>
  );
}

export function RadioDemo() {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div>
        <RadioGroup defaultValue="standard" aria-label="Shipping speed">
          <RadioItem value="standard" label="Standard" description="3–5 business days." />
          <RadioItem value="express" label="Express" description="1–2 business days." />
          <RadioItem value="pickup" label="Local pickup" description="Not set up yet." disabled />
        </RadioGroup>
        <p className="mt-4 text-caption text-ink-faint">RadioGroup · RadioItem with description</p>
      </div>
      <div>
        <RadioGroup defaultValue="monthly" orientation="horizontal" aria-label="Billing period">
          <RadioItem value="monthly" label="Monthly" />
          <RadioItem value="yearly" label="Yearly" />
        </RadioGroup>
        <p className="mt-4 text-caption text-ink-faint">RadioGroup · horizontal</p>
      </div>
    </div>
  );
}

export function SwitchDemo() {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div className="divide-y divide-line rounded-card border border-line">
        <Switch
          className="p-4"
          labelPosition="start"
          defaultChecked
          label="Online store"
          description="Customers can browse and buy."
        />
        <Switch
          className="p-4"
          labelPosition="start"
          label="Password protection"
          description="Only people with the password can visit."
        />
        <Switch
          className="p-4"
          labelPosition="start"
          label="Custom checkout"
          description="Not available on this plan."
          disabled
        />
      </div>
      <div className="grid content-start gap-4">
        <Switch label="Show prices with tax" defaultChecked />
        <Switch label="Compact tables" />
        <p className="mt-1 text-caption text-ink-faint">
          Switch · labelPosition start (settings rows) and end
        </p>
      </div>
    </div>
  );
}

export function SegmentedDemo() {
  const [view, setView] = useState("grid");
  return (
    <div className="grid gap-7">
      <Labeled label="SegmentedControl · md">
        <SegmentedControl
          aria-label="Chart period"
          defaultValue="week"
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "year", label: "Year" },
          ]}
        />
      </Labeled>
      <Labeled label="SegmentedControl · sm, with icons">
        <SegmentedControl
          aria-label="Layout"
          size="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: "grid", label: "Grid", icon: LayoutGrid },
            { value: "list", label: "List", icon: List },
          ]}
        />
      </Labeled>
      <Labeled label="SegmentedControl · fullWidth" className="[&>div]:block">
        <SegmentedControl
          aria-label="Billing"
          fullWidth
          defaultValue="yearly"
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
          ]}
        />
      </Labeled>
    </div>
  );
}

export function ChoiceCardsDemo() {
  return (
    <ChoiceCards
      name="business-type-demo"
      legend="What are you building?"
      defaultValue="commerce"
      columns={3}
      options={[
        {
          value: "commerce",
          title: "Online store",
          description: "Sell products with checkout.",
          visual: <GlyphTile name="commerce" size="sm" />,
        },
        {
          value: "website",
          title: "Business website",
          description: "Pages, forms and bookings.",
          visual: <GlyphTile name="website" size="sm" tone="neutral" />,
        },
        {
          value: "publishing",
          title: "Publication",
          description: "Articles and newsletters.",
          visual: <GlyphTile name="publishing" size="sm" tone="neutral" />,
        },
      ]}
    />
  );
}

/* --- Tabs ---------------------------------------------------------------------- */

function Panel({ children }: { children: ReactNode }) {
  return <p className="text-body-sm text-ink-muted">{children}</p>;
}

export function TabsDemo() {
  return (
    <div className="grid grid-cols-1 gap-12">
      <div>
        <Tabs defaultValue="general">
          <TabsList aria-label="Store settings">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="domains">Domains</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="api" disabled>
              API
            </TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <Panel>Name, address and regional settings.</Panel>
          </TabsContent>
          <TabsContent value="domains">
            <Panel>Connect a domain you own, or use your storevia.site address.</Panel>
          </TabsContent>
          <TabsContent value="team">
            <Panel>Invite people and choose what they can do.</Panel>
          </TabsContent>
          <TabsContent value="billing">
            <Panel>Plan, invoices and payment method.</Panel>
          </TabsContent>
        </Tabs>
        <p className="mt-6 text-caption text-ink-faint">
          Tabs variant=&quot;line&quot; (with a disabled tab)
        </p>
      </div>
      <div>
        <Tabs defaultValue="preview" variant="pill">
          <TabsList aria-label="Editor view">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">HTML</TabsTrigger>
            <TabsTrigger value="seo">Search listing</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="mt-4">
            <Panel>How the page looks to visitors.</Panel>
          </TabsContent>
          <TabsContent value="code" className="mt-4">
            <Panel>The generated markup, read-only.</Panel>
          </TabsContent>
          <TabsContent value="seo" className="mt-4">
            <Panel>Title and description in search results.</Panel>
          </TabsContent>
        </Tabs>
        <p className="mt-6 text-caption text-ink-faint">Tabs variant=&quot;pill&quot;</p>
      </div>
    </div>
  );
}

/* --- Navigation ---------------------------------------------------------------- */

export function BreadcrumbDemo() {
  return (
    <div className="grid gap-7">
      <Labeled label="Breadcrumb · on phones, levels above the parent fold into … (tap to expand)">
        <Breadcrumb
          aria-label="Example breadcrumb, four levels"
          items={[
            { label: "Northwind", href: "#breadcrumb" },
            { label: "Online store", href: "#breadcrumb" },
            { label: "Products", href: "#breadcrumb" },
            { label: "Linen apron, natural" },
          ]}
        />
      </Labeled>
      <Labeled label="Breadcrumb · three levels (folds on phones too)">
        <Breadcrumb
          aria-label="Example breadcrumb, three levels"
          items={[
            { label: "Northwind Ltd", href: "#breadcrumb" },
            { label: "Northwind Studio", href: "#breadcrumb" },
            { label: "Members" },
          ]}
        />
      </Labeled>
      <Labeled label="Breadcrumb · two levels">
        <Breadcrumb
          aria-label="Example breadcrumb, two levels"
          items={[{ label: "Settings", href: "#breadcrumb" }, { label: "Domains" }]}
        />
      </Labeled>
    </div>
  );
}

export function PaginationDemo() {
  const [page, setPage] = useState(5);
  return (
    <div className="grid gap-7">
      <Labeled label={`Pagination · onPageChange (page ${String(page)} of 12)`}>
        <Pagination
          aria-label="Example pagination"
          page={page}
          totalPages={12}
          onPageChange={setPage}
        />
      </Labeled>
      <Labeled label="Pagination · compact">
        <Pagination
          aria-label="Example pagination, compact"
          page={page}
          totalPages={12}
          onPageChange={setPage}
          compact
        />
      </Labeled>
    </div>
  );
}

interface MenuItem {
  readonly title: string;
  readonly description: string;
  readonly glyph: GlyphName;
}

const BUILD: readonly MenuItem[] = [
  { title: "Website builder", description: "Pages, sections and themes.", glyph: "builder" },
  { title: "Online store", description: "Products, checkout and orders.", glyph: "online-store" },
  { title: "Publishing", description: "Posts, newsletters and archives.", glyph: "publishing" },
  { title: "Portfolio", description: "Projects and case studies.", glyph: "portfolio" },
];
const RUN: readonly MenuItem[] = [
  { title: "Analytics", description: "Traffic and sales at a glance.", glyph: "analytics" },
  { title: "Teams", description: "Roles and permissions.", glyph: "teams" },
  { title: "Domains", description: "Connect and manage domains.", glyph: "domains" },
  { title: "Integrations", description: "Connect the tools you use.", glyph: "integrations" },
];
const SOLUTIONS: readonly MenuItem[] = [
  { title: "Retail", description: "Shops with a physical presence.", glyph: "retail" },
  { title: "Creators", description: "Sell work and grow an audience.", glyph: "media" },
  { title: "Publishers", description: "Editorial sites and newsletters.", glyph: "publishing" },
];

function MenuColumn({ heading, items }: { heading: string; items: readonly MenuItem[] }) {
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-overline text-ink-faint uppercase">{heading}</p>
      <ul className="grid">
        {items.map((item) => (
          <li key={item.title}>
            <NavigationMenuLink
              href="#navigation-menu"
              title={item.title}
              description={item.description}
              glyph={item.glyph}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NavigationMenuDemo() {
  return (
    <div className="rounded-panel border border-line bg-surface">
      {/* The header is the positioning context, so the panel centres under it. */}
      <div className="relative flex h-16 items-center gap-6 border-b border-line px-4 sm:px-6">
        <span className="hidden sm:block">
          <Logo size="sm" />
        </span>
        <NavigationMenu
          aria-label="Example site"
          className="static flex-1 justify-start"
          defaultValue="products"
        >
          <NavigationMenuList>
            <NavigationMenuItem value="products">
              <NavigationMenuTrigger>Products</NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid w-[min(38rem,calc(100vw-3rem))] gap-1 sm:grid-cols-2">
                  <MenuColumn heading="Build" items={BUILD} />
                  <MenuColumn heading="Run" items={RUN} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 rounded-control bg-subtle px-3 py-2.5">
                  <span className="text-body-sm text-ink-muted">
                    See every capability and its status
                  </span>
                  <a
                    href="#navigation-menu"
                    className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-700 hover:text-brand-800 pointer-coarse:-my-3 pointer-coarse:py-3"
                  >
                    Features
                    <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  </a>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem value="solutions">
              <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[min(20rem,calc(100vw-3rem))]">
                  {SOLUTIONS.map((item) => (
                    <li key={item.title}>
                      <NavigationMenuLink
                        href="#navigation-menu"
                        title={item.title}
                        description={item.description}
                        glyph={item.glyph}
                      />
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href="#navigation-menu">Pricing</NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <Button size="sm" className="hidden md:inline-flex">
          Start free
        </Button>
      </div>
      {/* A faint, centred page behind the menu: narrower than the Products
          panel, so the open panel covers it rather than cutting through it. */}
      <div aria-hidden="true" className="h-[44rem] rounded-b-panel px-4 pt-16 sm:h-[26rem] sm:px-6">
        <div className="mx-auto grid max-w-sm justify-items-center">
          <div className="h-3 w-20 rounded-pill bg-muted" />
          <div className="mt-5 h-7 w-full rounded-sm bg-muted" />
          <div className="mt-3 h-7 w-2/3 rounded-sm bg-muted" />
          <div className="mt-8 grid w-full justify-items-center gap-2">
            <div className="h-2.5 w-full rounded-pill bg-subtle" />
            <div className="h-2.5 w-11/12 rounded-pill bg-subtle" />
            <div className="h-2.5 w-3/4 rounded-pill bg-subtle" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Feedback ---------------------------------------------------------------- */

export function TooltipDemo() {
  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-4">
        <Tooltip content="Duplicate page">
          <IconButton variant="secondary" icon={Copy} aria-label="Duplicate page" />
        </Tooltip>
        <Tooltip content="Search (⌘K)" side="bottom">
          <IconButton variant="secondary" icon={Search} aria-label="Search" />
        </Tooltip>
        <Tooltip content="Publishes to your live site" side="right">
          <Button variant="secondary">Publish</Button>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export function PopoverDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" leadingIcon={Link2}>
            Share preview
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <p className="text-body-sm font-medium text-ink">Share a preview link</p>
          <p className="mt-1 text-body-sm text-ink-muted">
            Anyone with the link can view this draft.
          </p>
          <div className="mt-4 flex gap-2">
            <Input
              aria-label="Preview link"
              readOnly
              size="sm"
              defaultValue="https://northwind.example/preview"
              className="min-w-0 flex-1"
            />
            <PopoverClose asChild>
              <Button size="sm">Copy</Button>
            </PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ToastButtons() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            tone: "success",
            title: "Changes saved",
            description: "Your store is up to date.",
          })
        }
      >
        Success
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            tone: "neutral",
            title: "Product archived",
            description: "It no longer appears in your store.",
            action: { label: "Undo", onClick: () => undefined },
          })
        }
      >
        With action
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            tone: "warning",
            title: "Domain not verified yet",
            description: "DNS changes can take up to 24 hours.",
          })
        }
      >
        Warning
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            tone: "danger",
            title: "Couldn’t publish",
            description: "Check your connection and try again.",
          })
        }
      >
        Danger
      </Button>
    </div>
  );
}

export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
      <Toaster />
    </ToastProvider>
  );
}

export function ProgressDemo() {
  const [value, setValue] = useState(40);
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div className="grid content-start gap-6">
        <Progress label="Uploading images (example)" value={value} showValue />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setValue((v) => Math.max(0, v - 20));
            }}
          >
            −20
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setValue((v) => Math.min(100, v + 20));
            }}
          >
            +20
          </Button>
        </div>
      </div>
      <div className="grid content-start gap-6">
        <Progress label="Preparing export" />
        <Progress aria-label="Small" size="sm" value={72} />
        <Progress aria-label="Large" size="lg" value={24} />
        <p className="text-caption text-ink-faint">Progress · indeterminate, sm, lg</p>
      </div>
    </div>
  );
}

export function SpinnerDemo() {
  return (
    <div className="flex flex-wrap items-end gap-8">
      {(["xs", "sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="grid justify-items-center gap-3">
          <Spinner size={size} className="text-brand-600" />
          <span className="text-caption text-ink-faint">{size}</span>
        </div>
      ))}
      <div className="grid justify-items-center gap-3">
        <span className="inline-flex items-center gap-2 text-body-sm text-ink-muted">
          <Spinner size="sm" label="Loading orders" />
          Loading…
        </span>
        <span className="text-caption text-ink-faint">with label</span>
      </div>
    </div>
  );
}
