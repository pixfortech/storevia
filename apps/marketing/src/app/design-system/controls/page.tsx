import {
  Button,
  ButtonGroup,
  dateRangeBounds,
  IconButton,
  paginationRange,
  type ButtonVariant,
} from "@storevia/ui";
import { ArrowRight, Download, Ellipsis, Plus, Settings, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  BreadcrumbDemo,
  CheckboxDemo,
  ChoiceCardsDemo,
  ComboboxDemo,
  DateRangeDemo,
  FieldDemos,
  InputDemos,
  Labeled,
  NavigationMenuDemo,
  PaginationDemo,
  PendingButtonDemo,
  PopoverDemo,
  ProgressDemo,
  RadioDemo,
  SearchDemo,
  SegmentedDemo,
  SizeDemo,
  SpinnerDemo,
  SwitchDemo,
  TabsDemo,
  ToastDemo,
  ToolbarDemo,
  TooltipDemo,
} from "./demos";

export const metadata = { title: "Controls · Design system" };

// Computed here, in a server component, with fixed inputs: the pure helpers
// are server-safe (they live outside the client modules).
const EXAMPLE_PAGES = paginationRange(5, 12)
  .map((item) => (item === "ellipsis" ? "…" : String(item)))
  .join(" ");
const EXAMPLE_WEEK = dateRangeBounds({ preset: "7d" }, new Date(2026, 8, 24));

const CONTENTS = [
  ["buttons", "Buttons"],
  ["fields", "Text fields"],
  ["search", "Search and combobox"],
  ["date-range", "Date range"],
  ["selection", "Selection"],
  ["tabs", "Tabs"],
  ["navigation", "Navigation"],
  ["feedback", "Feedback"],
] as const;

const PRINCIPLES = [
  [
    "One action colour",
    "Brand blue marks the primary action and the current selection. Everything else is navy, grey and hairlines.",
  ],
  [
    "Three heights",
    "32, 40 and 48 px. Controls in a row share a height; touch screens get a 44 px hit area without a layout change.",
  ],
  [
    "Focus you can see",
    "A 2 px brand outline on buttons and links; a brand border with a soft ring on fields.",
  ],
  [
    "Errors say what to do",
    "Invalid fields turn red and carry a message with an icon, wired to the field for screen readers.",
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
  id,
  name,
  api,
  description,
  children,
  stage = "surface",
}: {
  id?: string;
  name: string;
  api: string;
  description: ReactNode;
  children: ReactNode;
  stage?: "surface" | "subtle" | "none";
}) {
  return (
    <div
      id={id}
      className="grid scroll-mt-24 gap-6 border-t border-line py-10 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12"
    >
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

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-xs bg-muted px-1 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

const VARIANTS: readonly (readonly [ButtonVariant, string])[] = [
  ["primary", "Publish"],
  ["secondary", "Preview"],
  ["ghost", "Cancel"],
  ["danger", "Delete store"],
  ["danger-outline", "Archive"],
];

export default function ControlsPage() {
  return (
    <div className="pb-8">
      <header className="max-w-(--container-prose)">
        <p className="text-overline text-brand-700 uppercase">Components</p>
        <h1 className="mt-3 font-display text-h1 text-ink">Controls</h1>
        <p className="mt-5 text-body-lg text-ink-muted">
          Buttons, fields, choices, navigation and feedback: the parts people touch. They share
          three heights, one radius, one focus treatment and one action colour, so any screen built
          from them reads as one product. Everything here ships from <Code>@storevia/ui</Code>; the
          content in the examples is illustrative.
        </p>
      </header>

      <nav aria-label="On this page" className="mt-10 mb-4">
        <ul className="flex flex-wrap gap-x-2 gap-y-2 pointer-coarse:gap-y-3.5">
          {CONTENTS.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="relative inline-flex h-8 items-center rounded-pill border border-line bg-surface px-3 text-label text-ink-muted transition-colors duration-(--duration-fast) hover:border-line-strong hover:text-ink pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-[7px]"
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

      <Section
        id="buttons"
        index="01"
        title="Buttons"
        description={
          <p>
            One primary button per view. Secondary for everything alongside it, ghost for quiet
            actions in toolbars and tables, danger only for the final step of something destructive.{" "}
            <Code>buttonClasses()</Code> styles links as buttons, including from server components.
          </p>
        }
      >
        <Specimen
          name="Variants"
          api='<Button variant="primary | secondary | ghost | danger | danger-outline | inverse">'
          description="Primary is brand blue with white text (6.5:1). Inverse is kept for the rare brand or dark surface."
        >
          <div className="flex flex-wrap items-center gap-3">
            {VARIANTS.map(([variant, label]) => (
              <Labeled key={variant} label={variant}>
                <Button variant={variant}>{label}</Button>
              </Labeled>
            ))}
          </div>
          {/* Inverse needs its own surface: a small navy tile, not a dark section. */}
          <div className="mt-8 border-t border-line pt-8">
            <div className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-card bg-navy-900 p-4">
              <Button variant="inverse">Talk to us</Button>
              <Button variant="inverse" size="sm">
                Contact sales
              </Button>
            </div>
            <p className="mt-3 text-caption text-ink-faint">inverse · md and sm, on navy-900</p>
          </div>
        </Specimen>

        <Specimen
          name="Sizes and icons"
          api='size="sm | md | lg" · leadingIcon · trailingIcon · fullWidth'
          description="32, 40 and 48 px. Icons come from Lucide at 16 px (20 px on lg) and sit 8 px from the label."
        >
          <div className="grid gap-6">
            {(["sm", "md", "lg"] as const).map((size) => (
              <Labeled key={size} label={`size="${size}"`}>
                <Button size={size} leadingIcon={Plus}>
                  New page
                </Button>
                <Button size={size} variant="secondary" leadingIcon={Download}>
                  Export
                </Button>
                <Button size={size} variant="ghost" trailingIcon={ArrowRight}>
                  View all
                </Button>
              </Labeled>
            ))}
            <Labeled label="fullWidth" className="max-w-sm [&>div]:block">
              <Button size="lg" fullWidth trailingIcon={ArrowRight}>
                Start free
              </Button>
            </Labeled>
          </div>
        </Specimen>

        <Specimen
          name="States"
          api="hover · active · :focus-visible · disabled · pending"
          description="Hover darkens by one step in 120 ms. Pending shows a spinner in place of the label and keeps the width, so nothing jumps; the label stays the accessible name."
        >
          <div className="flex flex-wrap gap-x-6 gap-y-5">
            <Labeled label="Default">
              <Button>Save changes</Button>
            </Labeled>
            <Labeled label="Hover">
              <Button className="bg-brand-700 hover:bg-brand-700">Save changes</Button>
            </Labeled>
            <Labeled label="Focus">
              <Button className="outline-2 outline-offset-2 outline-focus">Save changes</Button>
            </Labeled>
            <Labeled label="Disabled">
              <Button disabled>Save changes</Button>
            </Labeled>
            <Labeled label="Pending">
              <Button pending>Save changes</Button>
            </Labeled>
            <Labeled label="Click to try">
              <PendingButtonDemo />
            </Labeled>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-5 border-t border-line pt-6">
            <Labeled label="Secondary · hover">
              <Button variant="secondary" className="border-neutral-300 bg-subtle">
                Preview
              </Button>
            </Labeled>
            <Labeled label="Secondary · disabled">
              <Button variant="secondary" disabled>
                Preview
              </Button>
            </Labeled>
            <Labeled label="Ghost · hover">
              <Button variant="ghost" className="bg-muted text-ink">
                Cancel
              </Button>
            </Labeled>
            <Labeled label="Secondary · pending">
              <Button variant="secondary" pending>
                Preview
              </Button>
            </Labeled>
          </div>
        </Specimen>

        <Specimen
          name="IconButton"
          api='<IconButton icon={…} aria-label="…" variant="ghost | secondary | primary" size="sm | md | lg">'
          description="Square, icon-only. The aria-label is required by its type; pair it with a Tooltip so sighted people get the name too."
        >
          <div className="grid gap-6">
            {(["ghost", "secondary", "primary"] as const).map((variant) => (
              <Labeled key={variant} label={`variant="${variant}" · sm, md, lg`}>
                <IconButton variant={variant} size="sm" icon={Settings} aria-label="Settings" />
                <IconButton variant={variant} icon={Plus} aria-label="Add" />
                <IconButton variant={variant} size="lg" icon={Ellipsis} aria-label="More" />
                <IconButton variant={variant} icon={Trash2} aria-label="Delete" disabled />
              </Labeled>
            ))}
          </div>
        </Specimen>

        <Specimen
          name="ButtonGroup and toolbars"
          api='<ButtonGroup aria-label="…"> · fullWidth'
          description="Attached buttons share their borders. For one choice among options use SegmentedControl, which has radio semantics."
        >
          <div className="grid gap-6">
            <Labeled label="ButtonGroup · secondary buttons">
              <ButtonGroup aria-label="Export">
                <Button variant="secondary">Copy</Button>
                <Button variant="secondary">Share</Button>
                <Button variant="secondary" leadingIcon={Download}>
                  Download
                </Button>
              </ButtonGroup>
            </Labeled>
            <Labeled label="IconButton group, SegmentedControl and tooltips in a toolbar">
              <ToolbarDemo />
            </Labeled>
          </div>
        </Specimen>
      </Section>

      <Section
        id="fields"
        index="02"
        title="Text fields"
        description={
          <p>
            Fields are white, framed at 3:1 contrast so they are easy to find, and the frame darkens
            on hover. Focus draws a brand border and a soft 3 px ring. Text is 16 px on phones (so
            iOS never zooms) and 14 px above.
          </p>
        }
      >
        <Specimen
          id="field"
          name="Field"
          api="<Field label description hint error required optional labelAside>"
          description="Label, description, control and error in one place, with the ids wired for you. Pass the control as a child, or use the render function for full control."
        >
          <FieldDemos />
        </Specimen>
        <Specimen
          name="Input"
          api="<Input leadingIcon trailing addon size aria-invalid disabled>"
          description="Icons sit inside the frame in faint ink; an addon attaches a quiet segment for units and suffixes."
        >
          <InputDemos />
        </Specimen>
        <Specimen
          name="Sizes: Input, Select, Button"
          api='size="sm | md | lg"'
          description="Controls in a row share a height. Select is native (best on phones) with a drawn chevron; an empty-value option reads as its placeholder, in faint ink."
        >
          <SizeDemo />
        </Specimen>
      </Section>

      <Section
        id="search"
        index="03"
        title="Search and combobox"
        description={
          <p>
            SearchInput is a field with a search icon, a clear button and an optional shortcut hint.
            Combobox filters a list as you type and follows the ARIA combobox pattern.
          </p>
        }
      >
        <Specimen
          name="SearchInput"
          api="<SearchInput shortcut onClear clearLabel>"
          description="The shortcut hint hides on phones and gives way to the clear button once there is text."
        >
          <SearchDemo />
        </Specimen>
        <Specimen
          name="Combobox"
          api="<Combobox options value onValueChange filter emptyMessage name>"
          description="Accent-insensitive matching on labels and keywords, the match set in semibold, disabled options skipped by the keyboard, and a hidden input for forms. The list opens in a portal, so dialogs and scrolling panels never clip it."
        >
          <ComboboxDemo />
        </Specimen>
      </Section>

      <Section
        id="date-range"
        index="04"
        title="Date range"
        description={
          <p>
            Presets cover most questions; Custom reveals two native date inputs, which are the most
            reliable pickers on every device. The value is a preset or a from/to pair.
          </p>
        }
      >
        <Specimen
          name="DateRangePicker"
          api={`<DateRangePicker value onValueChange presets allowCustom min max size> · dateRangeBounds({ preset: "7d" }, 24 Sep 2026) → ${EXAMPLE_WEEK.from} to ${EXAMPLE_WEEK.to}`}
          description="Choosing Custom starts from the period in view. dateRangeBounds() turns any value into inclusive dates, in server components too (so ?range=30d can become query bounds before render)."
        >
          <DateRangeDemo />
        </Specimen>
      </Section>

      <Section
        id="selection"
        index="05"
        title="Selection"
        description={
          <p>
            Checkboxes for independent options, radios for one of a few, switches for settings that
            apply at once, segmented controls for views and periods, and choice cards when the
            options need a picture and a sentence. Every box, circle and track is drawn at 3:1, and
            each state survives forced-colours mode.
          </p>
        }
      >
        <Specimen
          name="Checkbox"
          api='<Checkbox label description checked="indeterminate">'
          description="A 16 px box that fills brand blue with a white check. The label is the hit target."
        >
          <CheckboxDemo />
        </Specimen>
        <Specimen
          name="RadioGroup"
          api="<RadioGroup orientation> · <RadioItem value label description>"
          description="Arrow keys move the selection; Tab leaves the group."
        >
          <RadioDemo />
        </Specimen>
        <Specimen
          name="Switch"
          api='<Switch label description labelPosition="start | end">'
          description="A 36 × 20 track: mid-grey when off, brand blue when on. Use it only when the change takes effect immediately."
        >
          <SwitchDemo />
        </Specimen>
        <Specimen
          name="SegmentedControl"
          api='<SegmentedControl options value onValueChange size="sm | md" fullWidth>'
          description="Equal segments on a framed track; the outlined white pill slides in 200 ms. Radio semantics, so arrow keys move and select. Every segment is at least 44 px on touch screens."
        >
          <SegmentedDemo />
        </Specimen>
        <Specimen
          name="ChoiceCards"
          api="<ChoiceCards name legend options defaultValue columns error>"
          description="Native radios drawn as cards. The selected card takes a brand border, a brand-25 wash and a check."
          stage="none"
        >
          <ChoiceCardsDemo />
        </Specimen>
      </Section>

      <Section
        id="tabs"
        index="06"
        title="Tabs"
        description={
          <p>
            Line tabs divide a page into sections with a 2 px brand indicator. Pill tabs switch
            views inside a panel or card. Both scroll sideways on narrow screens.
          </p>
        }
      >
        <Specimen
          name="Tabs"
          api='<Tabs variant="line | pill"> · TabsList · TabsTrigger · TabsContent'
          description="Arrow keys move between tabs; the panel follows."
        >
          <TabsDemo />
        </Specimen>
      </Section>

      <Section
        id="navigation"
        index="07"
        title="Navigation"
        description={
          <p>
            Breadcrumbs say where you are, pagination moves through long lists, and the navigation
            menu carries the marketing header&apos;s mega-menus.
          </p>
        }
      >
        <Specimen
          name="Breadcrumb"
          api="<Breadcrumb items linkAs collapse>"
          description="ChevronRight separators; the last item is the current page (aria-current) and keeps its full name while ancestors truncate. On phones, everything above the parent folds into a button that expands the trail and moves focus to it."
        >
          <BreadcrumbDemo />
        </Specimen>
        <Specimen
          name="Pagination"
          api={`<Pagination page totalPages onPageChange | getHref | hrefTemplate compact> · paginationRange(5, 12) → ${EXAMPLE_PAGES}`}
          description="The page list keeps a constant length while you page, and an ellipsis never hides a single page. Phones get “Page n of m”."
        >
          <PaginationDemo />
        </Specimen>
        <Specimen
          id="navigation-menu"
          name="NavigationMenu"
          api="NavigationMenu aria-label · List · Item · Trigger · Content · Link (title, description, glyph | icon)"
          description="Hover or focus a trigger: the panel scales in over 200 ms and resizes smoothly between menus. Rows pair a Storevia glyph with a title and one line of description; product concepts always use the glyph family."
          stage="none"
        >
          <NavigationMenuDemo />
        </Specimen>
      </Section>

      <Section
        id="feedback"
        index="08"
        title="Feedback"
        description={
          <p>
            Tooltips name things, popovers hold a small task, toasts confirm what just happened, and
            progress and spinners show work in flight. Under reduced motion, loading indicators stop
            moving and pulse gently instead.
          </p>
        }
      >
        <Specimen
          name="Tooltip"
          api="<TooltipProvider> · <Tooltip content side>"
          description="Navy, 12 px, 6 px radius and a small arrow, after a 300 ms hover or on keyboard focus."
        >
          <TooltipDemo />
        </Specimen>
        <Specimen
          name="Popover"
          api="Popover · PopoverTrigger · PopoverContent · PopoverClose"
          description="A white panel with a hairline and the popover shadow. Escape and outside clicks close it; focus returns to the trigger."
        >
          <PopoverDemo />
        </Specimen>
        <Specimen
          name="Toast"
          api="<ToastProvider> · <Toaster /> · useToast().toast({ tone, title, description, action })"
          description="Bottom right on desktop, bottom centre above the safe area on phones. Hover pauses the timer; swipe right to dismiss. Errors are announced assertively."
        >
          <ToastDemo />
        </Specimen>
        <Specimen
          name="Progress"
          api='<Progress value max label showValue size="sm | md | lg">'
          description="Brand blue on a neutral track. Without a value it is indeterminate: a sliding bar, or a gentle pulse under reduced motion."
        >
          <ProgressDemo />
        </Specimen>
        <Specimen
          name="Spinner"
          api='<Spinner size="xs | sm | md | lg" label>'
          description="Inherits the text colour. Pass a label when the spinner is the only sign of loading. Under reduced motion the ring pulses instead of turning."
        >
          <SpinnerDemo />
        </Specimen>
      </Section>
    </div>
  );
}
