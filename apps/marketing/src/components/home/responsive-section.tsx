// 11 Responsive administration: desktop, tablet and phone side by side,
// aligned on one baseline, each with the layout the dashboard ships for it.
import { Icon, Reveal, Stagger } from "@storevia/ui";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing";
import { capability } from "@/content/capabilities";
import { DashboardWindow } from "@/components/product/dashboard-window";
import { IllustrativeNote } from "@/components/product/frame";
import { PhoneAdmin } from "@/components/product/phone-admin";
import { TabletAdmin } from "@/components/product/tablet-admin";

const DEVICES = [
  {
    icon: Monitor,
    title: "Desktop",
    description: "A full sidebar, breadcrumbs and a ⌘K command menu to jump anywhere.",
  },
  {
    icon: Tablet,
    title: "Tablet",
    description: "An icon rail with a navigation drawer, two-column layouts and larger targets.",
  },
  {
    icon: Smartphone,
    title: "Phone",
    description: "A bottom bar with your key areas and Create, and sheets for everything else.",
  },
] as const;

export function ResponsiveSection() {
  return (
    <Section labelledBy="responsive-heading">
      <SectionHeading
        id="responsive-heading"
        eyebrow="Responsive administration"
        status={capability("administration").status}
        title="Run it from any screen"
        lead="Not a shrunken desktop. The dashboard is designed three times, once for each way you hold it."
        align="center"
        className="max-w-3xl"
      />
      {/* Wide screens: one row on a shared baseline, the phone in front of the
          tablet. Tablets: the desktop window above the other two. Phones: the
          phone alone, large enough to read. */}
      <div className="mt-12 flex flex-col items-center gap-8 lg:mt-16 xl:flex-row xl:items-end xl:gap-6">
        <Reveal className="hidden w-full min-w-0 md:block xl:flex-1">
          <DashboardWindow type="PUBLISHING" className="h-[24rem] xl:h-[27rem]" />
        </Reveal>
        <div className="flex w-full items-end justify-center xl:contents">
          <Reveal delay={80} className="hidden min-w-0 md:block md:w-[62%] xl:w-[36%] xl:shrink-0">
            <TabletAdmin type="PUBLISHING" />
          </Reveal>
          <Reveal
            delay={160}
            className="relative z-10 w-[64%] max-w-[16rem] md:-ml-[8%] md:w-[27%] md:max-w-none xl:-ml-[7%] xl:w-[17%] xl:shrink-0"
          >
            <PhoneAdmin type="PUBLISHING" />
          </Reveal>
        </div>
      </div>
      <IllustrativeNote className="mt-6 justify-center">
        Illustrative preview of a publication, with example figures.
      </IllustrativeNote>
      <Stagger
        as="ul"
        itemAs="li"
        className="mt-12 grid gap-8 border-t border-line pt-10 md:grid-cols-3"
      >
        {DEVICES.map((device) => (
          <div key={device.title} className="flex gap-4">
            <Icon icon={device.icon} size="lg" className="text-ink" />
            <div>
              <h3 className="text-body font-semibold text-ink">{device.title}</h3>
              <p className="mt-1 text-body-sm text-ink-muted">{device.description}</p>
            </div>
          </div>
        ))}
      </Stagger>
    </Section>
  );
}
