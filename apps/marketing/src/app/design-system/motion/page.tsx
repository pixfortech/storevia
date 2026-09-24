import { MOTION_DURATIONS } from "@storevia/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AnimatedNumberDemo,
  ChartRevealDemo,
  DrawLineDemo,
  FadeInDemo,
  FloatDemo,
  HoverLiftDemo,
  InViewCounter,
  ReducedMotionStatus,
  RevealDemo,
  ScaleInDemo,
  ScrollShowcase,
  SlideRevealDemo,
  StaggerDemo,
  TokenTables,
} from "./demos";

export const metadata = { title: "Motion · Design system" };

const CONTENTS = [
  ["tokens", "Tokens"],
  ["reduced-motion", "Reduced motion"],
  ["entrances", "Entrances"],
  ["data", "Numbers and charts"],
  ["interaction", "Interaction"],
  ["hooks", "Hooks"],
  ["on-scroll", "On scroll"],
] as const;

// Read on the server: the tokens are plain values outside the client boundary.
const SHORTEST = Math.min(...Object.values(MOTION_DURATIONS));
const LONGEST = Math.max(...Object.values(MOTION_DURATIONS));

const PRINCIPLES = [
  [
    "Purpose only",
    "Motion introduces content, confirms an action or keeps people oriented. Never decoration for its own sake.",
  ],
  [
    "Once, on first view",
    "Entrances run the first time something scrolls into view: IntersectionObserver decides when, CSS animations do the moving.",
  ],
  [
    "Final state first",
    "Server HTML is always the finished layout. Only content below the fold waits in a pre-state, so nothing above it flashes or delays loading.",
  ],
  [
    "Quiet by default",
    `8 px rises, 0.97 scales, a 6 px float. Durations stay between ${String(SHORTEST)} and ${String(LONGEST)} ms; emphasised easing for entrances.`,
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
  children,
  description,
}: {
  id?: string;
  name: string;
  api: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="grid scroll-mt-24 gap-6 border-t border-line py-10 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12"
    >
      <div className="lg:pt-1">
        <h3 className="font-display text-h4 text-ink">{name}</h3>
        <p className="mt-2 text-body-sm text-ink-muted">{description}</p>
        <p className="mt-4 break-words font-mono text-caption leading-relaxed text-ink-faint">
          {api}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
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

export default function MotionPage() {
  return (
    <div className="pb-8">
      <header className="max-w-(--container-prose)">
        <p className="text-overline uppercase text-brand-700">Foundations</p>
        <h1 className="mt-3 font-display text-h1 text-ink">Motion</h1>
        <p className="mt-5 text-body-lg text-ink-muted">
          Motion in Storevia is quiet and purposeful. It brings content in once, confirms what just
          happened and keeps people oriented, then gets out of the way. The primitives below live in{" "}
          <Code>@storevia/ui</Code> and are built on CSS animations, IntersectionObserver and
          requestAnimationFrame, with no animation library.
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

      <Section
        id="tokens"
        index="01"
        title="Tokens"
        description={
          <p>
            Four durations and three curves, defined in <Code>theme.css</Code> and mirrored for
            JavaScript as <Code>MOTION_DURATIONS</Code> and <Code>MOTION_EASINGS</Code>, which
            server components can read too. Press play to compare them.
          </p>
        }
      >
        <TokenTables />
      </Section>

      <Section id="reduced-motion" index="02" title="Reduced motion">
        <div className="grid gap-6 rounded-panel border border-line bg-subtle p-6 sm:p-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-center">
          <div className="space-y-3 text-body-sm text-ink-muted">
            <p className="text-body text-ink">
              With <Code>prefers-reduced-motion: reduce</Code>, every primitive renders its final
              state.
            </p>
            <p>
              Entrances never hide or move content, numbers show their value, charts appear drawn,
              floats stay still and hover lifts keep their shadow without moving. The check is live,
              so changing the system setting applies straight away, and <Code>theme.css</Code>{" "}
              shortens any remaining CSS animation to 1 ms.
            </p>
            <p>
              The same final state is what server HTML, print and browsers without JavaScript show.
              Screenshots and end-to-end tests get it by emulating the preference
              (Playwright&rsquo;s <Code>reducedMotion: &quot;reduce&quot;</Code>), which settles
              these primitives and the charts alike. Keep one test with motion allowed, so the real
              entrance stays covered.
            </p>
          </div>
          <div className="lg:justify-self-end">
            <ReducedMotionStatus />
          </div>
        </div>
      </Section>

      <Section
        id="entrances"
        index="03"
        title="Entrances"
        description={
          <p>
            Each entrance renders visible on the server. On the client, content that starts below
            the fold waits in a pre-state and animates when it enters the viewport. Replay mounts
            the specimen again with <Code>appear</Code>, which animates even in view but only for
            client-side mounts.
          </p>
        }
      >
        <Specimen
          name="Reveal"
          description="Fade and an 8 px rise over 640 ms. The default for sections, cards and blocks of copy."
          api="as · distance=8 · delay · duration='reveal' · easing='emphasised' · once · appear · rootMargin · threshold"
        >
          <RevealDemo />
        </Specimen>
        <Specimen
          name="FadeIn"
          description="Opacity only, for text over media, tables and anything read in place."
          api="as · delay · duration · easing · once · appear"
        >
          <FadeInDemo />
        </Specimen>
        <Specimen
          name="SlideReveal"
          description="A longer, directional entrance for side-by-side compositions. The direction is the way the content travels."
          api="direction='up' | 'down' | 'left' | 'right' · distance=16 · delay · duration · once · appear"
        >
          <SlideRevealDemo />
        </Specimen>
        <Specimen
          name="ScaleIn"
          description="Fade and a 0.97 scale over 320 ms, for product windows and media."
          api="scale=0.97 · duration='slow' · delay · once · appear"
        >
          <ScaleInDemo />
        </Specimen>
        <Specimen
          name="Stagger"
          description="Items that enter together start 60 ms apart in document order, capped at 480 ms. A row that scrolls in later starts its own sequence. Plain children are wrapped in Reveal."
          api="as · step=60 · maxDelay=480 · delay · variant='reveal' | 'fade' | 'scale' · itemAs · appear"
        >
          <StaggerDemo />
        </Specimen>
      </Section>

      <Section
        id="data"
        index="04"
        title="Numbers and charts"
        description={
          <p>
            Data motion confirms that figures arrived; it never changes what they say. The real
            value is always in the markup.
          </p>
        }
      >
        <Specimen
          name="AnimatedNumber"
          description="Counts to its value on first view, and from the previous value when it changes. Server HTML holds the final figure, which also reserves the width, so nothing shifts; the counting overlay is hidden from assistive technology."
          api="value · from=0 · format (Intl.NumberFormat options) · locale='en-US' · duration=900 · live · tabular · appear"
        >
          <AnimatedNumberDemo />
        </Specimen>
        <Specimen
          name="ChartReveal"
          description={
            <>
              Draws lines and grows bars the first time a chart graphic is seen. Marks opt in with a
              class (<Code>sv-motion-draw</Code>, <Code>-grow</Code>, <Code>-grow-x</Code>,{" "}
              <Code>-wipe</Code>, <Code>-fade</Code>) and an optional <Code>--sv-motion-i</Code>{" "}
              index; the root carries <Code>data-revealed</Code>. The{" "}
              <Link
                href="/design-system/charts"
                className="font-medium text-brand-700 hover:underline"
              >
                Charts
              </Link>{" "}
              components already reveal themselves, so ChartReveal is for custom chart graphics,
              such as product illustrations, drawn to the same spec as these.
            </>
          }
          api="as · delay · duration · easing='standard' · step=40 · once · appear"
        >
          <ChartRevealDemo />
        </Specimen>
        <Specimen
          name="DrawLine"
          description={
            <>
              An SVG path that draws itself in with the <Code>pathLength=1</Code> dash technique.
              Inside a ChartReveal it follows the chart.
            </>
          }
          api="…path props · delay · duration · easing='standard' · once · appear"
        >
          <DrawLineDemo />
        </Specimen>
      </Section>

      <Section
        id="interaction"
        index="05"
        title="Interaction"
        description={
          <p>
            Feedback on hover and focus, and the one ambient loop the system allows: the hero
            product window.
          </p>
        }
      >
        <Specimen
          id="hover-lift"
          name="HoverLift"
          description="A 2 px lift with the raised shadow on hover and keyboard focus, over 200 ms. Only on devices that hover; under reduced motion the shadow stays and the movement goes."
          api="as · asChild"
        >
          <HoverLiftDemo />
        </Specimen>
        <Specimen
          name="Float"
          description="A slow 6 px float on a 7 s cycle for hero product windows. Paused while off screen; still under reduced motion."
          api="as · delay"
        >
          <FloatDemo />
        </Specimen>
      </Section>

      <Section
        id="hooks"
        index="06"
        title="Hooks"
        description={
          <p>
            The two hooks the primitives are built on, for components that need their own behaviour.
          </p>
        }
      >
        <Specimen
          name="useInView"
          description="Whether an element is in the viewport. Observers are shared per option set, so a page with dozens of reveals stays cheap. False on the server."
          api="useInView(ref, { once = true, rootMargin, threshold }) → boolean"
        >
          <div className="rounded-panel border border-line bg-subtle p-5 sm:p-8">
            <InViewCounter />
          </div>
        </Specimen>
        <Specimen
          name="usePrefersReducedMotion"
          description="The live system preference, via useSyncExternalStore. False on the server and during hydration, then it follows changes to the setting."
          api="usePrefersReducedMotion() → boolean"
        >
          <div className="rounded-panel border border-line bg-subtle p-5 sm:p-8">
            <ReducedMotionStatus />
          </div>
        </Specimen>
      </Section>

      <Section
        id="on-scroll"
        index="07"
        title="On scroll"
        description={
          <p>
            The entrances as they appear on a page, with no <Code>appear</Code> and no replay: each
            one runs once, when it first scrolls into view.
          </p>
        }
      >
        <ScrollShowcase />
      </Section>
    </div>
  );
}
