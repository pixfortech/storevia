import { CTASection } from "@/components/marketing";
import { AnalyticsSection } from "@/components/home/analytics-section";
import { BuilderSection } from "@/components/home/builder-section";
import { BusinessTypes } from "@/components/home/business-types";
import { CommerceSection } from "@/components/home/commerce-section";
import { ContentSection } from "@/components/home/content-section";
import { FaqSection } from "@/components/home/faq-section";
import { Hero } from "@/components/home/hero";
import { ManagementSection } from "@/components/home/management-section";
import { Omnichannel } from "@/components/home/omnichannel";
import { PlatformSummary } from "@/components/home/platform-summary";
import { PricingPreview } from "@/components/home/pricing-preview";
import { ResponsiveSection } from "@/components/home/responsive-section";
import { TeamsSection } from "@/components/home/teams-section";
import { WhyStorevia } from "@/components/home/why";
import { publicCatalogue } from "@/lib/catalogue";
import { appLinks } from "@/lib/env";

// The home page (docs/design/design-plan.md §8): each section has its own
// layout and rhythm, and every capability shows its real status. Product
// visuals are built from the design system with example content, and say so.
export default async function HomePage() {
  const catalogue = await publicCatalogue();
  const { signUp } = appLinks();
  return (
    <>
      <Hero signUpHref={signUp} />
      <PlatformSummary />
      <WhyStorevia />
      <BusinessTypes />
      <BuilderSection />
      <CommerceSection />
      <ManagementSection />
      <ContentSection />
      <TeamsSection catalogue={catalogue} />
      <ResponsiveSection />
      <AnalyticsSection />
      <PricingPreview catalogue={catalogue} signUpHref={signUp} />
      <Omnichannel />
      <FaqSection />
      <CTASection
        title="Set up your first store in minutes"
        lead="Create your organisation, choose what you're building and invite your team. Free to start, no card needed."
      />
    </>
  );
}
