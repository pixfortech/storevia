import { Button } from "@storevia/ui/button";
import { Sparkline } from "@storevia/ui/charts";
import { cn } from "@storevia/ui/cn";
import { CommandMenuPreview } from "@storevia/ui/command-preview";
import {
  DataList,
  DescriptionList,
  Kbd,
  KpiCard,
  Metric,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  UsageMeter,
} from "@storevia/ui/data";
import { GlyphTile } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { Breadcrumb } from "@storevia/ui/navigation";
import { OverlayPreview } from "@storevia/ui/overlays";
import {
  Alert,
  Avatar,
  AvatarGroup,
  Badge,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  cardClasses,
  Divider,
  EmptyState,
  ExampleDataBadge,
  PageHeader,
  SectionHeader,
  Skeleton,
  StatusDot,
  type BadgeTone,
  type CardVariant,
} from "@storevia/ui/surfaces";
import { Lock, Plus, Upload } from "lucide-react";
import type { ReactNode } from "react";
import {
  CommandMenuDemo,
  ConfirmDialogDemo,
  DismissibleAlertDemo,
  DropdownMenuDemo,
  DropdownMenuPreviewDemo,
  FormDialogDemo,
  LeftDrawerDemo,
  MembersTableDemo,
  RightDrawerDemo,
  SheetDemo,
} from "./demos";
import {
  COMMAND_ITEMS,
  ExampleNav,
  FilterFields,
  INVITE,
  InviteFields,
  MEMBER_DETAILS,
  MemberDetails,
} from "./examples";

export const metadata = { title: "Surfaces · Design system" };

const CONTENTS = [
  ["cards", "Cards"],
  ["structure", "Page structure"],
  ["status", "Status"],
  ["empty", "Empty and loading"],
  ["people", "People"],
  ["metrics", "Metrics and usage"],
  ["data", "Tables and lists"],
  ["overlays", "Overlays"],
] as const;

const PRINCIPLES = [
  [
    "Hairline first",
    "Depth starts with a 1 px line. Shadows are for things that float: hover, menus, dialogs.",
  ],
  [
    "Words carry status",
    "Every badge, alert and meter says what it means. Colour supports the words; it never replaces them.",
  ],
  [
    "Honest numbers",
    "Real data, an honest “not collecting yet” frame, or clearly badged example data. Never invented figures.",
  ],
  [
    "Calm overlays",
    "A navy veil with no blur, one radius, one shadow. Focus is trapped, Esc always closes.",
  ],
] as const;

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

/**
 * An overlay specimen: a static picture of the open panel on a quiet stage,
 * and the live trigger under it.
 */
function OverlayStage({
  children,
  live,
  stageClassName,
}: {
  children: ReactNode;
  live: ReactNode;
  stageClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      <div className={cn("flex overflow-hidden bg-subtle", stageClassName)}>{children}</div>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3 border-t border-line px-4 py-4 sm:px-6">
        <p className="w-full text-overline text-ink-faint uppercase">Try it live</p>
        {live}
      </div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mt-3 font-mono text-caption text-ink-faint">{children}</p>;
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-xs bg-muted px-1 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

const CARD_VARIANTS: readonly (readonly [CardVariant, string])[] = [
  ["default", "A hairline. Most cards."],
  ["raised", "Adds the near-invisible card shadow."],
  ["interactive", "For links: lifts 2 px with the raised shadow."],
  ["sunken", "A quiet well inside a card or page."],
  ["dashed", "An empty slot or placeholder."],
];

const TONES: readonly BadgeTone[] = [
  "neutral",
  "brand",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
];

const TONE_WORDS: Record<BadgeTone, string> = {
  neutral: "Draft",
  brand: "Owner",
  accent: "Beta",
  success: "Published",
  warning: "Past due",
  danger: "Failed",
  info: "Invited",
};

// A square store logo for the avatar specimen (inline SVG, no request).
const LOGO_SRC = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#0b1530"/><circle cx="20" cy="24" r="9" fill="#fff"/><rect x="26" y="15" width="9" height="18" rx="2" fill="#3355ff"/></svg>',
)}`;

// Example series: each is the tile's own figure over the last 12 weeks
// (a rolling 30-day value per week), so the line ends on the figure and the
// point four weeks back is what the delta compares against.
const REVENUE = [9.6, 9.9, 10.1, 10.3, 10.6, 10.8, 10.9, 11.0, 11.1, 11.5, 11.9, 12.2, 12.48];
const ORDERS = [288, 292, 290, 297, 301, 299, 303, 304, 305, 309, 312, 315, 318];
const CONVERSION = [3.2, 3.1, 3.2, 3.1, 3.1, 3.0, 3.1, 3.1, 3.1, 3.0, 2.9, 2.9, 2.8];
const REFUNDS = [1.9, 1.8, 1.8, 1.7, 1.7, 1.6, 1.6, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2];
// Net sales by month, ending with this month (£48,210) after August (£44,560).
const NET_SALES = [36.2, 37.9, 39.4, 38.8, 40.6, 41.9, 42.7, 43.1, 42.4, 43.8, 44.56, 48.21];

const INVITATIONS = [
  {
    id: "i1",
    email: "lena@northwind.example",
    role: "Editor",
    sent: "2 days ago",
    expires: "In 5 days",
  },
  {
    id: "i2",
    email: "omar@northwind.example",
    role: "Viewer",
    sent: "6 days ago",
    expires: "Tomorrow",
  },
];

const ACTIVITY = [
  ["09:42", "Amara Okafor", "Published “Autumn edit”"],
  ["09:15", "Jonas Weber", "Changed Priya Raman’s role to Editor"],
  ["Yesterday", "Priya Raman", "Added 12 products"],
  ["Yesterday", "Amara Okafor", "Connected northwind.example"],
] as const;

export default function SurfacesPage() {
  return (
    <div className="pb-8">
      <header className="max-w-(--container-prose)">
        <p className="text-overline text-brand-700 uppercase">Components</p>
        <h1 className="mt-3 font-display text-h1 text-ink">Surfaces</h1>
        <p className="mt-5 text-body-lg text-ink-muted">
          Containers, status, data and overlays: the parts people read. They sit on white, separate
          with hairlines and lift only when something floats. Everything here ships from{" "}
          <Code>@storevia/ui</Code>; every name, store and figure on this page is example data.
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

      {/* 01 Cards ------------------------------------------------------------------- */}
      <Section
        id="cards"
        index="01"
        title="Cards"
        description={
          <p>
            A card groups one topic. Start with the hairline; add the card shadow only when a card
            sits on a tinted surface, and the hover lift only when the whole card is a link.{" "}
            <Code>cardClasses()</Code> styles a link as a card from server components.
          </p>
        }
      >
        <Specimen
          name="Variants"
          api='<Card variant="default | raised | interactive | sunken | dashed">'
          description="Five treatments, one radius (12 px). The interactive card is a link: hover or tab to it and it rises 2 px over 200 ms, the same lift as HoverLift. It stays put under reduced motion."
          stage="subtle"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CARD_VARIANTS.map(([variant, note]) =>
              variant === "interactive" ? (
                <a key={variant} href="#cards" className={cardClasses(variant, "p-5")}>
                  <p className="font-mono text-caption text-ink-faint">{variant}</p>
                  <p className="mt-6 text-body-sm text-ink">{note}</p>
                </a>
              ) : (
                <Card key={variant} variant={variant} className="p-5">
                  <p className="font-mono text-caption text-ink-faint">{variant}</p>
                  <p className="mt-6 text-body-sm text-ink">{note}</p>
                </Card>
              ),
            )}
          </div>
        </Specimen>
        <Specimen
          name="Anatomy"
          api="<Card> <CardHeader title description actions icon titleAs /> <CardBody /> <CardFooter /> </Card>"
          description="The header takes a title, a description, actions and an optional glyph. The footer sits behind a hairline and right-aligns its actions."
          stage="none"
        >
          <Card>
            <CardHeader
              titleAs="h4"
              icon={<GlyphTile name="domains" size="sm" />}
              title="Custom domain"
              description="Point your own address at this store."
              actions={
                <Badge variant="dot" tone="warning">
                  Pending
                </Badge>
              }
            />
            <CardBody>
              <DescriptionList
                items={[
                  { term: "Domain", detail: "northwind.example" },
                  {
                    term: "Record",
                    detail: (
                      <span className="font-mono text-caption">CNAME → stores.storevia.site</span>
                    ),
                  },
                  { term: "Last checked", detail: "4 minutes ago" },
                ]}
              />
            </CardBody>
            <CardFooter>
              <Button variant="ghost">Remove</Button>
              <Button variant="secondary">Check again</Button>
            </CardFooter>
          </Card>
        </Specimen>
      </Section>

      {/* 02 Page structure ---------------------------------------------------------- */}
      <Section
        id="structure"
        index="02"
        title="Page structure"
        description={
          <p>
            Every page opens with one <Code>PageHeader</Code>: where you are, what the page is, and
            its actions (primary last). Groups inside the page use <Code>SectionHeader</Code>.
            Dividers separate without adding weight.
          </p>
        }
      >
        <Specimen
          name="PageHeader"
          api='<PageHeader breadcrumb eyebrow title meta description actions divider as="h1" />'
          description="The title is the page’s h1 in Plus Jakarta: 24 px on phones, 32 px from tablet. Actions wrap under the title on phones. Inside this gallery it renders as an h4 (as), so the page keeps one h1."
        >
          <PageHeader
            as="h4"
            breadcrumb={
              <Breadcrumb
                items={[
                  { label: "Northwind Ltd", href: "#structure" },
                  { label: "Northwind Studio", href: "#structure" },
                  { label: "Members" },
                ]}
              />
            }
            eyebrow="Organisation"
            title="Members"
            meta={<Badge tone="neutral">5 of 10 seats</Badge>}
            description="Invite people, set their role and choose which stores they can open."
            actions={
              <>
                <Button variant="secondary">Export</Button>
                <Button leadingIcon={Plus}>Invite</Button>
              </>
            }
            divider
          />
        </Specimen>
        <Specimen
          name="SectionHeader"
          api="<SectionHeader eyebrow title description actions as />"
          description="A 19 px heading for groups of cards or settings inside a page: an h2 by default, an h4 here."
        >
          <SectionHeader
            as="h4"
            title="Stores"
            description="Each store has its own address, team access and website."
            actions={
              <Button variant="secondary" size="sm" leadingIcon={Plus}>
                New store
              </Button>
            }
          />
        </Specimen>
        <Specimen
          name="Divider"
          api='<Divider orientation="horizontal | vertical" label decorative />'
          description="A 1 px line in the hairline colour. Labelled dividers split alternatives; vertical ones split toolbar groups."
        >
          <div className="space-y-8">
            <Divider />
            <Divider label="or continue with" />
            <div className="flex h-8 items-center gap-4 text-body-sm text-ink-muted">
              <span>Preview</span>
              <Divider orientation="vertical" />
              <span>Share</span>
              <Divider orientation="vertical" />
              <span>Publish</span>
            </div>
          </div>
        </Specimen>
      </Section>

      {/* 03 Status ------------------------------------------------------------------ */}
      <Section
        id="status"
        index="03"
        title="Status"
        description={
          <p>
            Status colours are for status only, never for data series. Each one pairs a 50 tint with
            700 text (AA), and always travels with a word or an icon.
          </p>
        }
      >
        <Specimen
          name="Badge"
          api='<Badge tone="neutral | brand | accent | success | warning | danger | info" variant="soft | outline | dot" size="sm | md" dot icon>'
          description="Soft for most labels, outline beside other badges, dot in dense tables and lists. Pills, 12 px medium."
        >
          <div className="space-y-6">
            {(["soft", "outline", "dot"] as const).map((variant) => (
              <div key={variant}>
                <div className="flex flex-wrap gap-2">
                  {TONES.map((tone) => (
                    <Badge key={tone} tone={tone} variant={variant}>
                      {TONE_WORDS[tone]}
                    </Badge>
                  ))}
                </div>
                <Label>variant=&quot;{variant}&quot;</Label>
              </div>
            ))}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge size="sm" tone="brand">
                  Small
                </Badge>
                <Badge tone="brand">Medium</Badge>
                <Badge tone="success" dot>
                  Live
                </Badge>
                <Badge tone="neutral" icon={Lock}>
                  Business plan
                </Badge>
              </div>
              <Label>size · dot · icon</Label>
            </div>
          </div>
        </Specimen>
        <Specimen
          name="ExampleDataBadge"
          api='<ExampleDataBadge size="sm | md" /> · <KpiCard example> · <Metric example>'
          description="The one marker for example figures, everywhere: KPI tiles, metrics, chart cards and product visuals. A neutral dot badge that always reads “Example data”, because violet belongs to comparison data and amber to warnings."
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <ExampleDataBadge />
            <ExampleDataBadge size="md" />
            <p className="flex items-center gap-2 text-body-sm text-ink-muted">
              Revenue <ExampleDataBadge />
            </p>
          </div>
          <Label>sm (tiles, cards) · md (page notices) · beside a label</Label>
        </Specimen>
        <Specimen
          name="StatusDot"
          api='<StatusDot tone pulse label size="sm | md" />'
          description="A dot beside words, or alone with a label. The pulse marks live states and is still under reduced motion. In forced-colours mode dots draw in the text colour."
        >
          <ul className="grid gap-4 text-body-sm text-ink sm:grid-cols-2">
            <li className="flex items-center gap-2.5">
              <StatusDot tone="success" pulse /> Live · accepting orders
            </li>
            <li className="flex items-center gap-2.5">
              <StatusDot tone="warning" /> Domain check pending
            </li>
            <li className="flex items-center gap-2.5">
              <StatusDot tone="danger" /> Payment failed
            </li>
            <li className="flex items-center gap-2.5">
              <StatusDot tone="neutral" /> Draft
            </li>
            <li className="flex items-center gap-2.5">
              <StatusDot tone="brand" label="Selected" /> Dot with its own label
            </li>
          </ul>
        </Specimen>
        <Specimen
          name="Alert"
          api='<Alert tone="info | success | warning | danger | neutral" title actions icon onDismiss>'
          description="Inline messages about this page. Danger is announced assertively; the rest politely. Titles say what happened, the body says what to do. A dismissed alert hands focus to its neighbour in onDismiss (try the last one)."
          stage="none"
        >
          <div className="space-y-3">
            <Alert tone="info" title="Plan details are updating">
              Prices on this page may change before launch.
            </Alert>
            <Alert tone="success" title="Store published">
              northwind.example is live. Visitors see the new version now.
            </Alert>
            <Alert
              tone="warning"
              title="Payment is overdue"
              actions={
                <>
                  <Button size="sm">Update payment</Button>
                  <Button size="sm" variant="ghost">
                    View invoice
                  </Button>
                </>
              }
            >
              Your plan stays active until 8 October. Update your card to keep it.
            </Alert>
            <Alert tone="danger" title="You’re over your plan’s limits">
              Seats: nothing has been removed and everything keeps working, but you can’t invite
              anyone until you’re within your limit.
            </Alert>
            <DismissibleAlertDemo />
          </div>
        </Specimen>
      </Section>

      {/* 04 Empty and loading -------------------------------------------------------- */}
      <Section
        id="empty"
        index="04"
        title="Empty and loading"
        description={
          <p>
            An empty state says what will be here and how to start, with a line illustration at full
            size or a glyph when compact. Skeletons hold the layout while data loads; they shimmer
            once per 1.6 s and rest under reduced motion.
          </p>
        }
      >
        <Specimen
          name="EmptyState"
          api="<EmptyState illustration icon title description action secondaryAction compact titleAs />"
          description="Full size takes a 96–120 px <Illustration> in the product’s ribbon line; compact, for cards and table bodies, takes a GlyphTile."
          stage="none"
        >
          <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
            <Card variant="dashed">
              <EmptyState
                titleAs="h4"
                illustration={<Illustration name="empty-products" />}
                title="No products yet"
                description="Add your first product, or import a catalogue from a spreadsheet. Nothing is published until you say so."
                action={<Button leadingIcon={Plus}>Add product</Button>}
                secondaryAction={
                  <Button variant="secondary" leadingIcon={Upload}>
                    Import CSV
                  </Button>
                }
              />
            </Card>
            <Card>
              <CardHeader title="Invitations" titleAs="h4" />
              <EmptyState
                compact
                titleAs="h5"
                illustration={<GlyphTile name="teams" tone="neutral" />}
                title="No pending invitations"
                description="People you invite appear here until they accept."
              />
            </Card>
          </div>
        </Specimen>
        <Specimen
          name="Skeleton"
          api='<Skeleton shape="text | circle | rect" lines className />'
          description="Match the shape of what is coming. Mark the loading region with aria-busy; skeletons themselves are hidden from assistive tech."
        >
          <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading example">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Skeleton shape="circle" />
                <div className="flex-1 space-y-2">
                  <Skeleton shape="text" className="w-2/5" />
                  <Skeleton shape="text" className="h-2.5 w-3/5" />
                </div>
              </div>
              <Skeleton shape="text" lines={3} className="mt-6" />
            </Card>
            <Card className="p-5">
              <Skeleton shape="text" className="w-1/3" />
              <Skeleton className="mt-3 h-8 w-1/2" />
              <Skeleton className="mt-6 h-16 w-full" />
            </Card>
          </div>
        </Specimen>
      </Section>

      {/* 05 People ------------------------------------------------------------------ */}
      <Section
        id="people"
        index="05"
        title="People"
        description={
          <p>
            Avatars show a photo or logo when there is one and initials when there isn’t. The tint
            comes from the name, so the same person always looks the same.
          </p>
        }
      >
        <Specimen
          name="Avatar"
          api='<Avatar name src size="xs | sm | md | lg | xl" shape="circle | square" label />'
          description="Circles for people, squares for stores and organisations. A failed image falls back to initials without any client code."
        >
          <div className="space-y-8">
            <div>
              <div className="flex flex-wrap items-end gap-4">
                {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
                  <Avatar key={size} name="Amara Okafor" size={size} />
                ))}
              </div>
              <Label>xs 20 · sm 24 · md 32 · lg 40 · xl 48</Label>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                {[
                  "Jonas Weber",
                  "Priya Raman",
                  "Tom Ellis",
                  "Sofia Marin",
                  "Kenji Sato",
                  "Lena Novak",
                ].map((name) => (
                  <Avatar key={name} name={name} size="lg" />
                ))}
              </div>
              <Label>deterministic tints: brand, accent and navy at 50 and 100</Label>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name="Northwind Studio" shape="square" size="lg" />
                <Avatar name="Northwind Studio" shape="square" size="lg" src={LOGO_SRC} />
                <div className="ml-2 flex items-center gap-3">
                  <Avatar name="Amara Okafor" />
                  <div>
                    <p className="text-body-sm font-medium text-ink">Amara Okafor</p>
                    <p className="text-caption text-ink-faint">Owner</p>
                  </div>
                </div>
              </div>
              <Label>square · with an image · beside a name (decorative)</Label>
            </div>
          </div>
        </Specimen>
        <Specimen
          name="AvatarGroup"
          api="<AvatarGroup people max size label />"
          description="Overlapping avatars with a 2 px white ring and a +N count. Each avatar is named for screen readers."
        >
          <div className="flex flex-wrap items-center gap-8">
            <AvatarGroup
              label="Team members"
              people={[
                { name: "Amara Okafor" },
                { name: "Jonas Weber" },
                { name: "Priya Raman" },
                { name: "Tom Ellis" },
                { name: "Sofia Marin" },
                { name: "Kenji Sato" },
                { name: "Lena Novak" },
              ]}
            />
            <AvatarGroup
              label="Editors"
              size="sm"
              max={3}
              people={[{ name: "Priya Raman" }, { name: "Sofia Marin" }, { name: "Omar Haddad" }]}
            />
          </div>
        </Specimen>
      </Section>

      {/* 06 Metrics and usage ------------------------------------------------------- */}
      <Section
        id="metrics"
        index="06"
        title="Metrics and usage"
        description={
          <p>
            A metric is a label, a figure, its change and what it is compared with. Where Storevia
            doesn’t record something yet, the card says so instead of showing a number. The figures
            below are example data and are badged as such.
          </p>
        }
      >
        <Specimen
          name="KpiCard"
          api='<KpiCard label value delta lowerIsBetter comparison sparkline example status="live | not-collecting" href linkAs />'
          description="The KPI row tile, stacked so it works four across on desktop and two across on phones. The arrow follows the sign; the colour follows whether that is good news (a falling refund rate is green). The trend line is decorative: the delta already says what changed."
          stage="subtle"
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <KpiCard
              example
              label="Revenue"
              value="£12,480"
              delta={{ value: 12.4 }}
              comparison="vs previous 30 days"
              sparkline={<Sparkline decorative data={REVENUE} area />}
            />
            <KpiCard
              example
              label="Orders"
              value="318"
              delta={{ value: 4.3 }}
              comparison="vs previous 30 days"
              sparkline={<Sparkline decorative data={ORDERS} />}
              href="#metrics"
            />
            <KpiCard
              example
              label="Conversion rate"
              value="2.8%"
              delta={{ value: -0.3, label: "−0.3 pts" }}
              comparison="vs previous 30 days"
              sparkline={<Sparkline decorative data={CONVERSION} />}
            />
            <KpiCard
              example
              label="Refund rate"
              value="1.2%"
              delta={{ value: -0.4, label: "−0.4 pts" }}
              lowerIsBetter
              comparison="vs previous 30 days"
              sparkline={<Sparkline decorative data={REFUNDS} />}
            />
            <KpiCard label="Visitors" value="" status="not-collecting" className="col-span-2" />
          </div>
        </Specimen>
        <Specimen
          name="Metric"
          api='<Metric label value size="md | lg" delta comparison sparkline sparklinePlacement example badge footer />'
          description="The bare figure, for hero numbers and summaries. One 44 px figure per view at most. Figures share a baseline whether or not a trend line sits beside them."
        >
          <div className="grid gap-8 sm:grid-cols-[2fr_1fr] sm:gap-10">
            <Metric
              example
              size="lg"
              label="Net sales this month"
              value="£48,210"
              delta={{ value: 8.2 }}
              comparison="vs August"
              sparkline={<Sparkline decorative data={NET_SALES} height={40} />}
            />
            <Metric
              example
              label="Average order"
              value="£39.20"
              delta={{ value: 0 }}
              comparison="vs August"
            />
          </div>
        </Specimen>
        <Specimen
          name="UsageMeter"
          api='<UsageMeter label used limit unit warnAt hint size="sm | md" />'
          description="Plan usage. Amber from 80% and at the limit, red past it, and each state is written out with an icon. Unlimited shows an empty dashed track. In forced-colours mode the track is outlined and the fill uses the system highlight."
        >
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            <UsageMeter label="Stores" used={1} limit={3} />
            <UsageMeter label="Storage" used={4.2} limit={5} unit="GB" />
            <UsageMeter label="Team seats" used={7} limit={5} hint="Nothing was removed" />
            <UsageMeter label="Pages" used={1240} limit="unlimited" />
            <UsageMeter
              label="Emails this month"
              used={1000}
              limit={1000}
              hint="Resets on 1 October"
              className="sm:col-span-2"
            />
          </div>
        </Specimen>
      </Section>

      {/* 07 Tables and lists -------------------------------------------------------- */}
      <Section
        id="data"
        index="07"
        title="Tables and lists"
        description={
          <p>
            Tables keep their own scroll area, so a wide table never widens the page. While it
            overflows, the area can be focused and scrolled from the keyboard, and a soft shadow
            marks each edge with more beyond. Figures align right in tabular numerals.{" "}
            <Code>DataList</Code> turns rows into cards on phones.
          </p>
        }
      >
        <Specimen
          name="Table"
          api='<Table dense stickyHeader maxHeight scrollLabel> <TableHead sort="ascending | descending | none" onSort sortHref linkAs numeric />'
          description="Sortable headers are buttons (or links from server components, via linkAs for client-side routing) and set aria-sort on the sorted column. The header sticks inside the scroll area. Secondary columns fold away on phones. Rows are example data; the row menus confirm before removing anyone."
          stage="none"
        >
          <MembersTableDemo />
        </Specimen>
        <Specimen
          name="Table · dense"
          api="<Table dense> … <TableCaption visible />"
          description="40 px rows for logs and admin views. At phone width it scrolls sideways: the right edge shows a shadow, and Tab reaches the table."
          stage="none"
        >
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <Table dense className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ACTIVITY.map(([when, who, what]) => (
                  <TableRow key={`${when}-${what}`}>
                    <TableCell className="text-ink-faint tabular-nums">{when}</TableCell>
                    <TableCell className="font-medium">{who}</TableCell>
                    <TableCell className="text-ink-muted">{what}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableCaption visible className="pb-3">
                Recent activity (example data)
              </TableCaption>
            </Table>
          </div>
        </Specimen>
        <Specimen
          name="DataList"
          api="<DataList rows columns rowKey rowTestId empty caption />"
          description="A table from tablet up; stacked cards on phones, with the primary column as the card title. Resize to 390 px to see it change."
          stage="none"
        >
          <Card>
            <CardHeader
              titleAs="h4"
              title="Pending invitations"
              description="People invited to Northwind Ltd who haven’t joined yet."
              actions={<ExampleDataBadge />}
            />
            <DataList
              rows={INVITATIONS}
              rowKey={(r) => r.id}
              rowTestId="invitation-row"
              caption="Pending invitations"
              columns={[
                { key: "email", header: "Email", cell: (r) => r.email, primary: true },
                { key: "role", header: "Role", cell: (r) => r.role },
                { key: "sent", header: "Sent", cell: (r) => r.sent, hideOnMobile: true },
                {
                  key: "expires",
                  header: "Expires",
                  cell: (r) => (
                    <Badge variant="dot" tone={r.expires === "Tomorrow" ? "warning" : "neutral"}>
                      {r.expires}
                    </Badge>
                  ),
                },
              ]}
            />
          </Card>
        </Specimen>
        <Specimen
          name="DescriptionList"
          api='<DescriptionList items layout="horizontal | stacked" columns />'
          description="Term and detail pairs. Horizontal rows with hairlines for record details; stacked columns for summaries."
        >
          <div className="space-y-10">
            <DescriptionList
              items={[
                { term: "Store name", detail: "Northwind Studio" },
                { term: "Address", detail: "northwind.storevia.site" },
                { term: "Business type", detail: "Online store" },
                { term: "Created", detail: "12 March 2026" },
              ]}
            />
            <Divider decorative />
            <DescriptionList
              layout="stacked"
              columns={3}
              items={[
                { term: "Plan", detail: "Business" },
                { term: "Billing", detail: "Monthly" },
                {
                  term: "Status",
                  detail: (
                    <Badge tone="success" size="sm">
                      Active
                    </Badge>
                  ),
                },
              ]}
            />
          </div>
        </Specimen>
        <Specimen
          name="Kbd"
          api="<Kbd>⌘K</Kbd>"
          description="Keyboard hints in menus, tooltips and help text."
        >
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
            Press <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> to search, <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move and <Kbd>Esc</Kbd> to close.
          </p>
        </Specimen>
      </Section>

      {/* 08 Overlays ---------------------------------------------------------------- */}
      <Section
        id="overlays"
        index="08"
        title="Overlays"
        description={
          <p>
            Dialogs confirm and collect; drawers hold detail and navigation; sheets are for phones.
            Live, all share a navy veil at 32% with no blur, trap focus, close on Esc and hand focus
            back to where you were, even from a menu or ⌘K. The pictures below are static renders (
            <Code>OverlayPreview</Code>, <Code>DropdownMenuPreview</Code>,{" "}
            <Code>CommandMenuPreview</Code>) of the same panels, so they can be compared at a
            glance.
          </p>
        }
      >
        <Specimen
          name="Dialog"
          api='<Dialog title description trigger footer size="sm | md | lg" role="dialog | alertdialog" side open onOpenChange hideClose>'
          description="16 px radius and the window shadow; scales in over 200 ms. Focus starts on the first field, and the × comes last in the tab order. Destructive confirmations are alertdialogs: clicking outside doesn’t dismiss them and focus starts on Cancel."
          stage="none"
        >
          <OverlayStage
            stageClassName="px-4 py-8 sm:px-10 sm:py-12"
            live={
              <>
                <FormDialogDemo />
                <ConfirmDialogDemo />
              </>
            }
          >
            <OverlayPreview
              title={INVITE.title}
              description={INVITE.description}
              footer={
                <>
                  <Button variant="secondary" tabIndex={-1}>
                    Cancel
                  </Button>
                  <Button tabIndex={-1}>Send invitation</Button>
                </>
              }
            >
              <InviteFields />
            </OverlayPreview>
          </OverlayStage>
        </Specimen>
        <Specimen
          name="Drawer"
          api='<Drawer side="right | left" title description trigger footer>'
          description="Full-height panels: 384 px on the right for detail, 320 px on the left for navigation. They slide in over 320 ms, and the panel itself takes focus so a screen reader starts at its title."
          stage="none"
        >
          <OverlayStage
            stageClassName="grid gap-px bg-line md:grid-cols-[2fr_3fr]"
            live={
              <>
                <RightDrawerDemo />
                <LeftDrawerDemo />
              </>
            }
          >
            {/* Two small viewports: navigation docks left, detail docks right
                (phones show the detail panel only). */}
            <div className="hidden h-[27rem] bg-subtle md:flex">
              <OverlayPreview side="left" title="Northwind Studio">
                <ExampleNav />
              </OverlayPreview>
            </div>
            <div className="flex min-h-[24rem] bg-subtle md:h-[27rem]">
              <OverlayPreview
                side="right"
                title={MEMBER_DETAILS.title}
                description={MEMBER_DETAILS.description}
                footer={
                  <>
                    <Button variant="secondary" tabIndex={-1}>
                      Close panel
                    </Button>
                    <Button tabIndex={-1}>Save changes</Button>
                  </>
                }
              >
                <MemberDetails />
              </OverlayPreview>
            </div>
          </OverlayStage>
        </Specimen>
        <Specimen
          name="Sheet"
          api="<Sheet title description trigger footer>"
          description="The phone pattern: a bottom sheet with a grab handle, at most 85% of the screen, padded for the home indicator. The sheet takes focus itself, so no field raises the keyboard over it."
          stage="none"
        >
          <OverlayStage stageClassName="min-h-[22rem] px-4 pt-10 sm:px-10" live={<SheetDemo />}>
            <OverlayPreview
              side="bottom"
              title="Filters"
              footer={
                <>
                  <Button variant="secondary" tabIndex={-1}>
                    Reset
                  </Button>
                  <Button tabIndex={-1}>Show orders</Button>
                </>
              }
            >
              <FilterFields />
            </OverlayPreview>
          </OverlayStage>
        </Specimen>
        <Specimen
          name="DropdownMenu"
          api='<DropdownMenuItem icon shortcut tone="danger" inset asChild> · <DropdownMenuCheckboxItem> · <DropdownMenuLabel> · <DropdownMenuSeparator>'
          description="At least 220 px wide; 36 px items, 44 px on touch screens. Shortcuts read Ctrl on Windows, hide on touch screens and reach screen readers as aria-keyshortcuts. Destructive items are red and confirm in an alertdialog."
          stage="none"
        >
          <OverlayStage
            stageClassName="justify-center px-4 py-8 sm:px-10"
            live={<DropdownMenuDemo />}
          >
            <DropdownMenuPreviewDemo />
          </OverlayStage>
        </Specimen>
        <Specimen
          name="CommandMenu"
          api="<CommandMenu open onOpenChange items onSelect placeholder /> · useCommandShortcut()"
          description="A keyboard-first jump list, a third of the way down the screen. It only lists destinations the page passes in; a hint such as “Soon” shows at every width, under the label on phones."
          stage="none"
        >
          <OverlayStage stageClassName="px-3 py-6 sm:px-10 sm:py-10" live={<CommandMenuDemo />}>
            <CommandMenuPreview items={COMMAND_ITEMS} className="mx-auto" />
          </OverlayStage>
        </Specimen>
      </Section>

      <p className="mt-4 text-caption text-ink-faint">
        Source: <Code>packages/ui/src</Code> surfaces.tsx, data.tsx, overlays.tsx and command.tsx.
      </p>
    </div>
  );
}
