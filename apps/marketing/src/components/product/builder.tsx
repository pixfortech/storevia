// The website builder as a concept: the inspector panel on its own (for the
// hero collage) and the whole editor (page structure, canvas, inspector and
// device switch). The builder is on the roadmap, so these show the direction,
// not a shipped screen; every mockup that uses them says so. Numbered markers
// tie parts of the editor to the captions beside it.
import { Button, ButtonGroup, buttonClasses } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Glyph, Icon, LogoMark } from "@storevia/ui/icons";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Italic,
  Link2,
  Monitor,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Mockup, WindowFrame } from "./frame";
import { ProductArt } from "./product-art";
import { SAMPLE_DASHBOARDS } from "./sample-data";

const STORE = SAMPLE_DASHBOARDS.ECOMMERCE.store;

/** A numbered marker matching a caption (decorative: the captions carry the words). */
export function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "absolute z-10 flex size-5 items-center justify-center rounded-full bg-brand-600 text-[10.5px] font-semibold text-white ring-4 ring-brand-600/15 tabular-nums",
        className,
      )}
    >
      {n}
    </span>
  );
}

function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <p className="text-[9.5px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
      {children}
    </p>
  );
}

/** A property row: label and a value in a field-like box. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <span className="flex h-6 w-[6.5rem] items-center justify-between rounded-sm border border-line-strong bg-surface px-2 text-[11px] text-ink">
        {value}
        <Icon icon={ChevronDown} size="xs" className="size-3 text-ink-faint" />
      </span>
    </div>
  );
}

/** A value on a track, like a slider. */
function Track({ label, value, share }: { label: string; value: string; share: number }) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr_1.75rem] items-center gap-2">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <span className="relative h-1 rounded-pill bg-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-pill bg-brand-500"
          style={{ width: `${String(share * 100)}%` }}
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line-control bg-surface shadow-xs"
          style={{ left: `${String(share * 100)}%` }}
        />
      </span>
      <span className="text-right text-[11px] text-ink tabular-nums">{value}</span>
    </div>
  );
}

function Segments({
  options,
  selected,
}: {
  options: readonly { label: ReactNode; key: string }[];
  selected: string;
}) {
  return (
    <ButtonGroup fullWidth>
      {options.map((option) => (
        <Button
          key={option.key}
          size="sm"
          variant="secondary"
          aria-pressed={option.key === selected}
          className={cn(
            "h-6 flex-1 px-0 text-[11px]",
            option.key === selected ? "bg-subtle text-ink" : "text-ink-muted",
          )}
        >
          {option.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}

const THEME_SWATCHES = [
  "bg-surface",
  "bg-surface-sunken",
  "bg-brand-50",
  "bg-accent-50",
  "bg-navy-900",
] as const;

interface InspectorProps {
  /** Show numbered markers for the captions (layout 3, themes 5). */
  markers?: boolean;
  /** Layout and type only (a floating glimpse). */
  compact?: boolean;
  className?: string | undefined;
}

/** The inspector for the selected section: layout, type, spacing and theme. */
function Inspector({ markers = false, compact = false, className }: InspectorProps) {
  const align: [string, LucideIcon][] = [
    ["left", AlignLeft],
    ["center", AlignCenter],
    ["right", AlignRight],
  ];
  return (
    <div className={cn("flex flex-col bg-surface text-left", className)}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3.5">
        <Glyph name="builder" className="size-4 text-ink" />
        <span className="text-[12px] font-semibold text-ink">Hero section</span>
        <span className="ml-auto rounded-xs bg-subtle px-1.5 py-0.5 text-[10px] text-ink-muted">
          Section
        </span>
      </div>
      <div className="relative space-y-2.5 border-b border-line px-3.5 py-3">
        {markers ? <Marker n={3} className="top-2.5 -left-2.5" /> : null}
        <PanelHeading>Layout</PanelHeading>
        <Segments
          selected="split"
          options={[
            { key: "stack", label: "Stack" },
            { key: "split", label: "Split" },
            { key: "grid", label: "Grid" },
          ]}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-muted">Alignment</span>
          <span className="w-[6.5rem]">
            <Segments
              selected="left"
              options={align.map(([key, icon]) => ({
                key,
                label: <Icon icon={icon} size="xs" />,
              }))}
            />
          </span>
        </div>
      </div>
      <div className="space-y-2 border-b border-line px-3.5 py-3">
        <PanelHeading>Type</PanelHeading>
        <Field label="Heading" value="Display" />
        <Field label="Body" value="Large" />
      </div>
      {compact ? null : (
        <>
          <div className="space-y-2.5 border-b border-line px-3.5 py-3">
            <PanelHeading>Spacing</PanelHeading>
            <Track label="Top" value="96" share={0.62} />
            <Track label="Bottom" value="64" share={0.42} />
          </div>
          <div className="relative space-y-2 px-3.5 py-3">
            {markers ? <Marker n={5} className="top-2.5 -left-2.5" /> : null}
            <PanelHeading>Theme colours</PanelHeading>
            <div className="flex gap-1.5">
              {THEME_SWATCHES.map((swatch, index) => (
                <span
                  key={swatch}
                  className={cn(
                    "size-5 rounded-full border border-line-strong",
                    swatch,
                    index === 1 && "ring-2 ring-brand-500 ring-offset-2",
                  )}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The inspector on its own, as a floating panel (hero collage). */
export function BuilderPanel({
  compact = false,
  className,
}: {
  /** Layout and type only. */
  compact?: boolean;
  className?: string | undefined;
}) {
  return (
    <Mockup
      label="Illustration: the website builder's inspector, a concept for a feature on the roadmap."
      className={className}
    >
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-popover">
        <Inspector compact={compact} />
      </div>
    </Mockup>
  );
}

const LAYERS: readonly { label: string; depth: number; selected?: boolean }[] = [
  { label: "Header", depth: 0 },
  { label: "Hero", depth: 0 },
  { label: "Heading", depth: 1, selected: true },
  { label: "Text", depth: 1 },
  { label: "Button", depth: 1 },
  { label: "Image", depth: 1 },
  { label: "Bestsellers", depth: 0 },
  { label: "Footer", depth: 0 },
];

function Structure({ markers }: { markers: boolean }) {
  return (
    <div className="relative hidden w-[12.5rem] shrink-0 flex-col border-r border-line bg-surface @3xl/editor:flex">
      {markers ? <Marker n={1} className="top-3 -right-2.5" /> : null}
      <div className="border-b border-line px-3 py-3">
        <PanelHeading>Pages</PanelHeading>
        <ul className="mt-2 space-y-px text-[11.5px]">
          {["Home", "Shop", "Journal", "About"].map((page, index) => (
            <li
              key={page}
              className={cn(
                "flex h-7 items-center gap-2 rounded-sm px-2",
                index === 0 ? "bg-subtle font-medium text-ink" : "text-ink-muted",
              )}
            >
              <Icon icon={FileText} size="xs" className="text-ink-faint" />
              {page}
            </li>
          ))}
        </ul>
      </div>
      <div className="px-3 py-3">
        <PanelHeading>Layers</PanelHeading>
        <ul className="mt-2 space-y-px text-[11.5px]">
          {LAYERS.map((layer) => (
            <li
              key={layer.label}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-sm pr-2",
                layer.depth ? "pl-6" : "pl-2",
                layer.selected
                  ? "bg-brand-50 font-medium text-brand-800 ring-1 ring-brand-200 ring-inset"
                  : "text-ink-muted",
              )}
            >
              {layer.depth === 0 ? (
                <Icon
                  icon={layer.label === "Hero" ? ChevronDown : ChevronRight}
                  size="xs"
                  className="size-3 text-ink-faint"
                />
              ) : null}
              {layer.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The page being edited, with the selected heading and the text toolbar. */
function Canvas({ markers }: { markers: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 justify-center overflow-hidden bg-surface-sunken p-4 @2xl/editor:p-6">
      <div className="w-full max-w-[40rem] rounded-control border border-line bg-surface shadow-card">
        <div className="flex h-9 items-center gap-4 border-b border-line px-4">
          <span className="font-display text-[12px] font-bold tracking-[-0.02em] text-ink">
            {STORE}
          </span>
          <span className="ml-auto flex gap-3 text-[10.5px] text-ink-muted">
            <span>Shop</span>
            <span>Journal</span>
            <span>About</span>
          </span>
        </div>
        <div className="grid items-center gap-4 px-5 py-6 @2xl/editor:grid-cols-[1fr_0.8fr]">
          <div className="min-w-0">
            <div className="relative">
              {/* The text toolbar floats over the selection. */}
              <div className="absolute -top-9 left-0 flex h-7 items-center gap-0.5 rounded-control border border-line bg-surface px-1 shadow-popover">
                {markers ? <Marker n={2} className="-top-2.5 -left-2.5" /> : null}
                {[Bold, Italic, Link2].map((icon, index) => (
                  <span
                    key={index}
                    className={cn(
                      "flex size-5 items-center justify-center rounded-xs text-ink-muted",
                      index === 0 && "bg-subtle text-ink",
                    )}
                  >
                    <Icon icon={icon} size="xs" className="size-3" />
                  </span>
                ))}
                <span className="mx-0.5 h-4 w-px bg-line" />
                <span className="flex h-5 items-center gap-1 px-1 text-[10.5px] text-ink-muted">
                  Display
                  <Icon icon={ChevronDown} size="xs" className="size-2.5" />
                </span>
              </div>
              <p className="relative mt-3 font-display text-[22px] leading-[1.12] font-semibold tracking-[-0.025em] text-ink outline-[1.5px] outline-offset-4 outline-brand-500 outline-solid @2xl/editor:text-[26px]">
                The autumn collection
                <span className="ml-0.5 inline-block h-[0.9em] w-px translate-y-[0.1em] bg-brand-600" />
                {/* Resize handles at the selection's corners. */}
                {[
                  "-top-[7px] -left-[7px]",
                  "-top-[7px] -right-[7px]",
                  "-bottom-[7px] -left-[7px]",
                  "-right-[7px] -bottom-[7px]",
                ].map((corner) => (
                  <span
                    key={corner}
                    className={cn("absolute size-1.5 border border-brand-500 bg-surface", corner)}
                  />
                ))}
              </p>
            </div>
            <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">
              Stoneware, linen and oak, made in small batches.
            </p>
            <span className={buttonClasses("primary", "sm", "mt-3.5 h-7 px-3 text-[11.5px]")}>
              Shop the collection
            </span>
          </div>
          <div className="hidden h-36 items-end justify-center rounded-control bg-surface-sunken pt-3 @2xl/editor:flex">
            <ProductArt kind="vase" className="size-28" />
            <ProductArt kind="mug" className="-ml-6 size-20" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2.5 border-t border-line px-5 py-4">
          {(["mug", "vase", "board", "apron"] as const).map((kind) => (
            <div
              key={kind}
              className="flex aspect-square items-center justify-center rounded-sm bg-surface-sunken"
            >
              <ProductArt kind={kind} className="size-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface EditorWindowProps {
  /** Show the numbered markers that match the captions. */
  markers?: boolean;
  className?: string;
}

/** The whole editor: page structure, canvas, inspector and the device switch. */
export function EditorWindow({ markers = false, className }: EditorWindowProps) {
  const devices: [string, LucideIcon][] = [
    ["Desktop", Monitor],
    ["Tablet", Tablet],
    ["Phone", Smartphone],
  ];
  return (
    <Mockup
      label="Illustration: the Storevia website builder, a concept for a feature on the roadmap: page structure, a canvas with a selected heading, the inspector and a device switch."
      className={className}
    >
      <WindowFrame className="h-full">
        <div className="@container/editor flex h-full flex-col">
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-3.5">
            <LogoMark size={18} />
            <span className="flex min-w-0 items-center gap-1.5 text-[12px]">
              <span className="hidden truncate text-ink-muted @xl/editor:inline">{STORE}</span>
              <Icon
                icon={ChevronRight}
                size="xs"
                className="hidden text-neutral-400 @xl/editor:inline"
              />
              <span className="font-medium text-ink">Home</span>
            </span>
            <span className="relative mx-auto">
              {markers ? <Marker n={4} className="-top-2 -right-3" /> : null}
              <ButtonGroup>
                {devices.map(([name, icon], index) => (
                  <Button
                    key={name}
                    size="sm"
                    variant="secondary"
                    aria-pressed={index === 0}
                    aria-label={name}
                    className={cn(
                      "h-7 w-8 px-0",
                      index === 0 ? "bg-subtle text-ink" : "text-ink-faint",
                    )}
                  >
                    <Icon icon={icon} size="sm" />
                  </Button>
                ))}
              </ButtonGroup>
            </span>
            <span className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={Eye}
                className="hidden @lg/editor:inline-flex"
              >
                Preview
              </Button>
              <Button size="sm">Publish</Button>
            </span>
          </div>
          <div className="flex min-h-0 flex-1">
            <Structure markers={markers} />
            <Canvas markers={markers} />
            <Inspector
              markers={markers}
              className="hidden w-[15.5rem] shrink-0 border-l border-line @2xl/editor:flex"
            />
          </div>
        </div>
      </WindowFrame>
    </Mockup>
  );
}
