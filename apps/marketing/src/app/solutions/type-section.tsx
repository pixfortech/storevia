// One business type on /solutions: what Storevia adapts for it, a product
// visual, the store navigation it gets (each area with its real timing) and
// the roles it suggests. Everything but the headline comes from the domain's
// business-type definitions (@storevia/tenancy/business-types).
import {
  BUSINESS_TYPE_DEFINITIONS,
  STORE_AREAS,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { ROLE_LABELS } from "@storevia/tenancy/rbac";
import { cn, GlyphTile, Icon, Reveal } from "@storevia/ui";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Section, SectionHeading, StatusPill } from "@/components/marketing";
import { AREA_ICONS } from "@/components/product/area-icons";
import { DashboardWindow } from "@/components/product/dashboard-window";
import { IllustrativeNote } from "@/components/product/frame";
import { PhoneAdmin } from "@/components/product/phone-admin";
import { PostEditor } from "@/components/product/post-editor";
import { TabletAdmin } from "@/components/product/tablet-admin";
import {
  areaTiming,
  BUSINESS_TYPE_ANCHOR,
  BUSINESS_TYPE_GLYPH,
  SOLUTION_COPY,
} from "@/content/business-types";

// A different view of the product for each type, so the page doesn't show
// the same window four times.
const VISUALS: Record<BusinessType, { visual: ReactNode; note: string }> = {
  ECOMMERCE: {
    visual: <DashboardWindow type="ECOMMERCE" className="h-[22rem] sm:h-[26rem]" />,
    note: "Illustrative preview of an online store's dashboard, with example figures.",
  },
  BUSINESS: {
    visual: (
      <div className="rounded-panel border border-line bg-surface-sunken px-5 py-8 sm:px-10 sm:py-12">
        <TabletAdmin type="BUSINESS" />
      </div>
    ),
    note: "Illustrative preview of a business website's dashboard on a tablet, with example figures.",
  },
  PUBLISHING: {
    visual: <PostEditor className="h-[24rem] sm:h-[26rem]" />,
    note: "A concept of publishing on the roadmap, with a sample post.",
  },
  PORTFOLIO: {
    visual: (
      <div className="flex justify-center rounded-panel border border-line bg-surface-sunken px-5 py-8 sm:py-10">
        <PhoneAdmin type="PORTFOLIO" className="w-[15rem]" />
      </div>
    ),
    note: "Illustrative preview of a portfolio's dashboard on a phone, with example figures.",
  },
};

/** An area's timing: live today, or when it's planned. */
function AreaTiming({ availability }: { availability: string | undefined }) {
  if (!availability) return <StatusPill status="available" label={areaTiming(availability)} />;
  return (
    <span className="text-caption whitespace-nowrap text-ink-faint">
      {areaTiming(availability)}
    </span>
  );
}

export function TypeSection({ type, index }: { type: BusinessType; index: number }) {
  const definition = BUSINESS_TYPE_DEFINITIONS[type];
  const anchor = BUSINESS_TYPE_ANCHOR[type];
  const copy = SOLUTION_COPY[type];
  const { visual, note } = VISUALS[type];
  const reverse = index % 2 === 1;
  const focus = definition.homeFocus.map((key) => STORE_AREAS[key].label.toLowerCase());
  return (
    <Section
      id={anchor}
      tone={index % 2 === 0 ? "plain" : "tinted"}
      labelledBy={`${anchor}-heading`}
    >
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal className={cn("min-w-0", reverse && "lg:order-2")}>
          <GlyphTile name={BUSINESS_TYPE_GLYPH[type]} size="lg" />
          <SectionHeading
            className="mt-6"
            id={`${anchor}-heading`}
            eyebrow={definition.label}
            title={copy.headline}
            lead={copy.lead}
          />
          <ul className="mt-8 space-y-3">
            {definition.adapts.map((line) => (
              <li key={line} className="flex gap-3 text-body text-ink-muted">
                <Icon icon={Check} size="sm" className="mt-1 text-brand-600" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className={cn("min-w-0", reverse && "lg:order-1")}>
          {visual}
          <IllustrativeNote className="mt-4">{note}</IllustrativeNote>
        </Reveal>
      </div>

      <div className="mt-14 grid items-start gap-4 lg:mt-18 lg:grid-cols-[5fr_7fr]">
        <div className="rounded-panel border border-line bg-surface">
          <div className="border-b border-line px-5 py-4 sm:px-6">
            <h3 className="font-display text-h4 text-ink">Your store&apos;s navigation</h3>
            <p className="mt-1 text-body-sm text-ink-muted">
              In this order. The store&apos;s home starts with {focus.join(", ")}.
            </p>
          </div>
          <ul className="px-2 py-2 sm:px-3">
            {definition.navigation.map((key) => {
              const area = STORE_AREAS[key];
              return (
                <li
                  key={key}
                  className="flex min-h-11 items-center gap-3 rounded-control px-3 py-2"
                >
                  <Icon icon={AREA_ICONS[key]} size="nav" className="text-ink-muted" />
                  <span className="min-w-0 flex-1 text-body-sm font-medium text-ink">
                    {area.label}
                  </span>
                  <AreaTiming availability={area.availability} />
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-panel border border-line bg-surface">
          <div className="border-b border-line px-5 py-4 sm:px-6">
            <h3 className="font-display text-h4 text-ink">Suggested roles</h3>
            <p className="mt-1 text-body-sm text-ink-muted">
              Offered first when you invite someone to this store. Every role works with every type.
            </p>
          </div>
          <dl className="-mb-px grid sm:grid-cols-2">
            {definition.rolePresets.map((preset) => (
              <div
                key={preset.label}
                className="border-b border-line px-5 py-3.5 sm:px-6 sm:odd:border-r"
              >
                <dt className="flex flex-wrap items-baseline gap-x-2 text-body-sm font-semibold text-ink">
                  {preset.label}
                  {preset.label !== ROLE_LABELS[preset.role] ? (
                    <span className="text-caption font-normal text-ink-faint">
                      {ROLE_LABELS[preset.role]} role
                    </span>
                  ) : null}
                </dt>
                <dd className="mt-0.5 text-caption text-ink-muted">{preset.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}
