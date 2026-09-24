// Motion primitives: server markup must be the final, visible state, the
// JavaScript timing helpers must agree with the CSS tokens, and the pure
// helpers must stay outside the client boundary.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AnimatedNumber,
  ChartReveal,
  DrawLine,
  FadeIn,
  Float,
  HoverLift,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  Reveal,
  ScaleIn,
  SlideReveal,
  Stagger,
  motionBezier,
  motionCountFormatter,
  motionEasing,
  motionStaggerDelay,
  useInView,
  usePrefersReducedMotion,
} from "./motion";
import { motionEntranceStart } from "./motion-core";
import { useRef } from "react";

const source = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8");
const theme = source("theme.css");
const motionCss = source("motion.css");

/** Every `prelude { … }` block in a stylesheet, with balanced braces. */
function cssBlocks(css: string, prelude: string) {
  const blocks: { start: number; end: number; body: string }[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(prelude, from);
    if (start === -1) return blocks;
    const open = css.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    blocks.push({ start, end: end + 1, body: css.slice(open + 1, end) });
    from = end + 1;
  }
}

/** The stylesheet without its `prelude { … }` blocks. */
function withoutBlocks(css: string, prelude: string): string {
  let out = "";
  let from = 0;
  for (const block of cssBlocks(css, prelude)) {
    out += css.slice(from, block.start);
    from = block.end;
  }
  return out + css.slice(from);
}

const NO_PREFERENCE = "@media screen and (prefers-reduced-motion: no-preference)";

// Anything that would hide content in server HTML.
const HIDDEN = /opacity:\s*0|visibility:\s*hidden|display:\s*none|data-sv-motion=|data-sv-counting/;

describe("server markup", () => {
  it("renders entrances visible, with no pre-state", () => {
    const html = renderToStaticMarkup(
      <>
        <Reveal as="section" delay={120}>
          <h2>Reveal</h2>
        </Reveal>
        <FadeIn>Fade</FadeIn>
        <SlideReveal direction="left">Slide</SlideReveal>
        <ScaleIn appear>Scale</ScaleIn>
      </>,
    );
    expect(html).toContain("<section");
    expect(html).toContain("<h2>Reveal</h2>");
    expect(html).toContain("--sv-motion-delay:120ms");
    expect(html).toContain("--sv-motion-from:translate3d(16px, 0, 0)");
    expect(html).not.toMatch(HIDDEN);
  });

  it("wraps plain Stagger children and leaves entrances alone", () => {
    const html = renderToStaticMarkup(
      <Stagger as="ul" itemAs="li" itemClassName="item">
        <span>One</span>
        <span>Two</span>
      </Stagger>,
    );
    expect(html).toBe(
      '<ul><li class="sv-motion item" style="--sv-motion-from:translate3d(0, 8px, 0)"><span>One</span></li>' +
        '<li class="sv-motion item" style="--sv-motion-from:translate3d(0, 8px, 0)"><span>Two</span></li></ul>',
    );
    const nested = renderToStaticMarkup(
      <Stagger>
        <FadeIn as="p">Item</FadeIn>
      </Stagger>,
    );
    expect(nested).toBe('<div><p class="sv-motion" style="--sv-motion-from:none">Item</p></div>');
  });

  it("prints the final formatted value of an AnimatedNumber", () => {
    const html = renderToStaticMarkup(<AnimatedNumber value={12480} className="text-metric" />);
    expect(html).toContain('<span class="sv-motion-number-value">12,480</span>');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("tabular-nums");
    expect(html).not.toMatch(HIDDEN);

    const money = renderToStaticMarkup(
      <AnimatedNumber
        value={48210}
        format={{ style: "currency", currency: "USD" }}
        locale="en-US"
      />,
    );
    expect(money).toContain(">$48,210.00<");
    const percent = renderToStaticMarkup(
      <AnimatedNumber value={0.842} format={{ style: "percent", maximumFractionDigits: 1 }} live />,
    );
    expect(percent).toContain('aria-live="polite">84.2%<');
  });

  it("renders charts and lines in their final state", () => {
    const html = renderToStaticMarkup(
      <ChartReveal>
        <svg viewBox="0 0 10 10">
          <DrawLine d="M0 10L10 0" stroke="currentColor" />
          <rect className="sv-motion-grow" width="2" height="4" />
        </svg>
      </ChartReveal>,
    );
    expect(html).toContain('data-revealed="true"');
    expect(html).toContain('class="sv-motion-chart"');
    // Inside a chart the line follows the chart's class contract.
    expect(html).toContain('class="sv-motion-draw"');
    expect(html).toContain('pathLength="1"');
    expect(html).not.toMatch(HIDDEN);
    expect(html).not.toContain("dashoffset");

    const line = renderToStaticMarkup(
      <svg>
        <DrawLine d="M0 0h10" delay={80} duration="slow" />
      </svg>,
    );
    expect(line).toContain('class="sv-motion-line"');
    expect(line).toContain("--sv-motion-duration:var(--duration-slow)");
  });

  it("renders HoverLift and Float as plain wrappers", () => {
    expect(renderToStaticMarkup(<HoverLift className="p-4">Card</HoverLift>)).toBe(
      '<div class="sv-motion-lift rounded-card p-4">Card</div>',
    );
    expect(
      renderToStaticMarkup(
        <HoverLift asChild>
          <a href="/pricing" className="rounded-panel">
            Plans
          </a>
        </HoverLift>,
      ),
    ).toBe('<a href="/pricing" class="sv-motion-lift rounded-panel">Plans</a>');
    expect(renderToStaticMarkup(<Float delay={-2000}>Window</Float>)).toBe(
      '<div class="sv-motion-float" style="--sv-motion-float-delay:-2000ms">Window</div>',
    );
  });
});

describe("hooks on the server", () => {
  it("report false: not in view, no reduced-motion preference known", () => {
    function Probe() {
      const ref = useRef<HTMLDivElement>(null);
      const inView = useInView(ref);
      const reduced = usePrefersReducedMotion();
      return <div ref={ref}>{`${String(inView)} ${String(reduced)}`}</div>;
    }
    expect(renderToStaticMarkup(<Probe />)).toBe("<div>false false</div>");
  });
});

describe("motionBezier", () => {
  it("pins the endpoints and matches linear", () => {
    const linear = motionBezier(0, 0, 1, 1);
    expect(linear(0)).toBe(0);
    expect(linear(1)).toBe(1);
    expect(linear(-1)).toBe(0);
    expect(linear(0.3)).toBeCloseTo(0.3, 5);
  });

  it("matches the browser's `ease` curve", () => {
    const ease = motionBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
    expect(ease(0.25)).toBeCloseTo(0.4085, 3);
  });

  it("gives an emphasised (expo-out) curve that is monotonic and front-loaded", () => {
    const ease = motionEasing("emphasised");
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = ease(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
    expect(ease(0.3)).toBeGreaterThan(0.8);
    expect(motionEasing("emphasised")).toBe(ease);
  });
});

describe("motionCountFormatter", () => {
  it("formats the target exactly and whole steps for integers", () => {
    const format = motionCountFormatter(12480);
    expect(format(12480)).toBe("12,480");
    expect(format(1234.5678)).toBe("1,235");
    expect(format(0)).toBe("0");
  });

  it("keeps the target's decimals while counting", () => {
    const format = motionCountFormatter(0.842, { style: "percent", maximumFractionDigits: 1 });
    expect(format(0.842)).toBe("84.2%");
    expect(format(0.12)).toBe("12.0%");
    expect(format(0.12345)).toBe("12.3%");
  });

  it("keeps currency digits and never shows a negative zero", () => {
    const money = motionCountFormatter(48210, { style: "currency", currency: "USD" });
    expect(money(48210)).toBe("$48,210.00");
    expect(money(12.3)).toBe("$12.30");
    const delta = motionCountFormatter(-5);
    expect(delta(-0.3)).toBe("0");
    expect(delta(-4.6)).toBe("-5");
  });

  it("honours another locale", () => {
    expect(motionCountFormatter(1234.5, { maximumFractionDigits: 1 }, "de-DE")(1234.5)).toBe(
      "1.234,5",
    );
  });

  it("leaves compact and significant-digit formats as asked", () => {
    expect(motionCountFormatter(12480, { notation: "compact" })(12480)).toBe("12K");
    expect(motionCountFormatter(12480, { notation: "compact" })(999)).toBe("999");
    expect(motionCountFormatter(1, { maximumSignificantDigits: 2 })(1234)).toBe("1,200");
  });
});

describe("motionStaggerDelay", () => {
  it("steps and caps", () => {
    expect(motionStaggerDelay(0)).toBe(0);
    expect(motionStaggerDelay(3)).toBe(180);
    expect(motionStaggerDelay(20)).toBe(480);
    expect(motionStaggerDelay(2, { step: 40, maxDelay: 60, delay: 100 })).toBe(160);
    expect(motionStaggerDelay(-1)).toBe(0);
  });
});

describe("tokens", () => {
  it("mirror the theme's durations and easings", () => {
    for (const [name, ms] of Object.entries(MOTION_DURATIONS)) {
      expect(theme).toContain(`--duration-${name}: ${String(ms)}ms;`);
    }
    for (const [name, points] of Object.entries(MOTION_EASINGS)) {
      expect(theme).toContain(`--ease-${name}: cubic-bezier(${points.join(", ")});`);
    }
  });

  it("scope every hidden pre-state to screens without reduced motion", () => {
    const scoped = cssBlocks(motionCss, NO_PREFERENCE).map((block) => block.body);
    expect(scoped.join("")).toMatch(/\[data-sv-motion="pending"\][^{]*{\s*opacity: 0;/);
    // Outside keyframes and those media blocks, nothing may hide content.
    const rest = withoutBlocks(withoutBlocks(motionCss, "@keyframes"), NO_PREFERENCE);
    expect(rest).not.toContain("@keyframes");
    expect(rest).not.toMatch(
      /opacity:\s*0|visibility:\s*hidden|color:\s*transparent|stroke-dashoffset|scale:|clip-path/,
    );
  });

  it("keep base rules in the components layer, so utilities can override them", () => {
    const layers = cssBlocks(motionCss, "@layer components");
    expect(layers).toHaveLength(1);
    const layer = layers[0]?.body ?? "";
    for (const base of [
      ".sv-motion-number {",
      ".sv-motion-number-ticker {",
      ".sv-motion-lift {",
      ".sv-motion-float {",
    ]) {
      expect(layer).toContain(base);
    }
    // States must beat utilities while they apply, so they stay unlayered.
    expect(layer).not.toMatch(/\[data-sv-|:hover|:focus/);
    const unlayered = withoutBlocks(motionCss, "@layer components");
    expect(unlayered).not.toMatch(/^\s*\.sv-motion-(number|number-ticker|lift|float) \{/m);
    expect(unlayered).toContain('.sv-motion[data-sv-motion="pending"]');
    expect(unlayered).toContain(".sv-motion-lift:hover");
  });
});

describe("module boundaries", () => {
  const directive = /^\s*["']use client["'];?\s*$/m;

  it("keep the tokens and helpers out of the client boundary", () => {
    // motion.tsx is what index.ts re-exports: with a directive, server
    // components would get client references instead of MOTION_DURATIONS.
    expect(source("motion.tsx")).not.toMatch(directive);
    expect(source("motion-core.ts")).not.toMatch(directive);
    expect(source("motion-client.tsx")).toMatch(/^"use client";/);
  });

  it("never special-case automated browsers", () => {
    // Screenshots and tests get the final state by emulating reduced motion.
    for (const file of ["motion.tsx", "motion-core.ts", "motion-client.tsx"]) {
      expect(source(file)).not.toContain("webdriver");
    }
  });
});

describe("motionEntranceStart", () => {
  const base = { allowed: true, once: true, appear: false };

  it("never hides content that is in view at mount", () => {
    expect(motionEntranceStart({ ...base, inView: true })).toBe("static");
  });

  it("holds content below the fold in the pre-state until it enters", () => {
    expect(motionEntranceStart({ ...base, inView: false })).toBe("pending");
    expect(motionEntranceStart({ ...base, inView: false, once: false })).toBe("pending");
  });

  it("animates client-side appear mounts even when in view", () => {
    expect(motionEntranceStart({ ...base, inView: true, appear: true })).toBe("pending");
  });

  it("re-arms repeatable entrances without hiding them first", () => {
    expect(motionEntranceStart({ ...base, inView: true, once: false })).toBe("watch");
  });

  it("does nothing when motion isn't allowed", () => {
    for (const inView of [true, false]) {
      for (const appear of [true, false]) {
        expect(motionEntranceStart({ allowed: false, inView, once: true, appear })).toBe("static");
      }
    }
  });
});
