// 08 Store management: the merchant dashboard at full size, with example
// figures, and an honest line on what the store home shows today versus
// what arrives with orders and analytics.
import { ScaleIn } from "@storevia/ui/motion";
import { Section, SectionHeading, StatusPill } from "@/components/marketing";
import { DashboardWindow } from "@/components/product/dashboard-window";
import { IllustrativeNote } from "@/components/product/frame";
import { PhoneAdmin } from "@/components/product/phone-admin";

const STAGES = [
  {
    status: "available",
    title: "Today",
    description:
      "Each store's home shows what to set up next, product and stock counts, low and out-of-stock items, and your plan's usage.",
  },
  {
    status: "roadmap",
    title: "With orders",
    description: "Revenue, orders and top products, once checkout and orders arrive.",
  },
  {
    status: "roadmap",
    title: "With analytics",
    description: "Visitors, customer growth and trends, with history set by your plan.",
  },
] as const;

export function ManagementSection() {
  return (
    <Section labelledBy="manage-heading">
      <div className="grid items-end gap-6 lg:grid-cols-2 lg:gap-16">
        <SectionHeading
          id="manage-heading"
          eyebrow="Store management"
          title="Your business at a glance, every morning"
        />
        <p className="max-w-xl text-body-lg text-ink-muted lg:justify-self-end">
          One home for each store: what sold, who visited, what your team changed and what needs you
          next. Figures fill in as each part of Storevia ships.
        </p>
      </div>
      <ScaleIn className="mt-12 lg:mt-16">
        <DashboardWindow variant="full" className="hidden h-[38rem] sm:block lg:h-[45rem]" />
        {/* On a phone, the dashboard as a phone shows it. */}
        <PhoneAdmin className="mx-auto w-[74%] max-w-[17rem] sm:hidden" />
      </ScaleIn>
      <IllustrativeNote className="mt-5">
        Illustrative preview with example figures, not a real store.
      </IllustrativeNote>
      <ol className="mt-10 grid gap-8 md:grid-cols-3">
        {STAGES.map((stage) => (
          <li key={stage.title} className="border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body font-semibold text-ink">{stage.title}</h3>
              <StatusPill status={stage.status} />
            </div>
            <p className="mt-2 text-body-sm text-ink-muted">{stage.description}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
