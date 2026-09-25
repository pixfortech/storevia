// 02 Hero: the proposition, the two actions and the product composition.
// All white; the composition carries the visual weight.
import { buttonClasses, Icon } from "@storevia/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/marketing";
import { HeroVisual } from "./hero-visual";

export function Hero({ signUpHref }: { signUpHref: string }) {
  return (
    <section aria-labelledby="hero-heading" className="overflow-x-clip pt-12 sm:pt-16 lg:pt-20">
      <Container>
        <div className="mx-auto max-w-4xl text-center">
          <Link
            href="/resources#roadmap"
            className="group/pill inline-flex min-h-8 items-center gap-2 rounded-pill border border-line bg-surface py-1 pr-3 pl-1.5 text-caption text-ink-muted shadow-xs transition-colors duration-(--duration-fast) hover:border-line-strong hover:text-ink"
          >
            <span className="rounded-pill bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
              Roadmap
            </span>
            See what&apos;s ready today
            <Icon
              icon={ArrowRight}
              size="xs"
              className="transition-transform duration-(--duration-base) ease-(--ease-emphasised) group-hover/pill:translate-x-0.5"
            />
          </Link>
          <h1
            id="hero-heading"
            className="mt-7 font-display text-[2.5rem] leading-[1.06] font-[650] tracking-[-0.035em] text-balance text-ink sm:text-display-l lg:text-display-xl"
          >
            {/* No full stops: the display face spaces them loosely at this size. */}
            <span className="block">Build your business online</span>{" "}
            <span className="block text-ink-muted">Run it from one place</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-body-lg text-pretty text-ink-muted">
            Storevia brings your website, commerce, content, customers, team and analytics into one
            calm workspace, shaped around the kind of business you run.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={signUpHref} className={buttonClasses("primary", "lg")}>
              Start free
            </a>
            <Link href="/products" className={buttonClasses("secondary", "lg")}>
              Explore Storevia
            </Link>
          </div>
          <p className="mt-4 text-caption text-ink-faint">
            Free to start. No card needed, and nothing to install.
          </p>
        </div>
      </Container>
      <HeroVisual />
    </section>
  );
}
