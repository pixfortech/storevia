// The hero's product composition, built from the product mockups (real
// design-system components with example content): the dashboard in front of
// a storefront, the builder's inspector attached to the storefront it edits,
// a channels card over the chart and the phone app beside the dashboard.
// Overlaps are placed on chrome and padding, never on the figures. Below
// 1280 px the dashboard and the phone remain; phones get the phone alone,
// large enough to read (with a figure card beside it once there's room).
// The satellites float a few pixels (not under reduced motion).
import { cn, Float } from "@storevia/ui";
import { Container } from "@/components/marketing";
import { AnalyticsCard, ChannelsCard } from "@/components/product/analytics";
import { BuilderPanel } from "@/components/product/builder";
import { DashboardWindow } from "@/components/product/dashboard-window";
import { IllustrativeNote } from "@/components/product/frame";
import { PhoneAdmin } from "@/components/product/phone-admin";
import { StorefrontPreview } from "@/components/product/storefront-preview";

export function HeroVisual({ className }: { className?: string }) {
  return (
    <Container className={cn("mt-14 sm:mt-16 lg:mt-20", className)}>
      {/* Wide screens: the full collage. */}
      <div className="relative hidden aspect-[1216/780] xl:block">
        <StorefrontPreview products={2} className="absolute top-[5%] left-[-2%] h-[67%] w-[36%]" />
        <DashboardWindow className="absolute top-[2%] left-[20%] z-10 h-[77%] w-[66%]" />
        <Float delay={-600} className="absolute top-[71.5%] left-[-2.5%] z-20 w-[19%]">
          <BuilderPanel compact />
        </Float>
        <Float delay={-1800} className="absolute top-[68%] left-[51%] z-20 w-[19%]">
          <ChannelsCard />
        </Float>
        <Float delay={-3000} className="absolute top-[17%] right-[-2%] z-20 w-[17.5%]">
          <PhoneAdmin />
        </Float>
      </div>
      {/* Tablets and small laptops: the dashboard and the phone. */}
      <div className="relative hidden aspect-[16/11] md:block xl:hidden">
        <DashboardWindow className="absolute top-0 left-0 h-[86%] w-[88%]" />
        <Float delay={-3000} className="absolute top-[18%] right-0 z-10 w-[29%]">
          <PhoneAdmin />
        </Float>
      </div>
      {/* Phones: the phone app alone; from 640 px a figure card sits beside it,
          touching only the phone's bezel. */}
      <div className="relative mx-auto w-full max-w-[22rem] sm:max-w-[34rem] md:hidden">
        <PhoneAdmin className="mx-auto w-[74%] sm:mr-[6%] sm:w-[48%]" />
        <Float delay={-1800} className="absolute bottom-[14%] left-0 hidden w-[48%] sm:block">
          <AnalyticsCard />
        </Float>
      </div>
      <IllustrativeNote className="mt-8 justify-center xl:mt-16">
        Illustrative preview. The business, people and figures are examples.
      </IllustrativeNote>
    </Container>
  );
}
