// Motion tokens and pure helpers (motion.tsx). No "use client" directive, so
// server components can read the tokens and call the helpers; the components
// and hooks live in motion-client.tsx.

// --- Tokens (mirrors theme.css; kept in sync by motion.test.tsx) ----------------

/** Duration tokens in ms: hover/press, menus/toggles, panels/sheets, section reveals. */
export const MOTION_DURATIONS = { fast: 120, base: 200, slow: 320, reveal: 640 } as const;
export type MotionDuration = keyof typeof MOTION_DURATIONS;

/** Easing tokens as cubic-bézier control points. */
export const MOTION_EASINGS = {
  standard: [0.2, 0, 0, 1],
  emphasised: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
} as const;
export type MotionEasing = keyof typeof MOTION_EASINGS;

/** Elements the motion wrappers can render as. */
export type MotionElement =
  | "div"
  | "span"
  | "section"
  | "article"
  | "aside"
  | "header"
  | "footer"
  | "main"
  | "nav"
  | "ul"
  | "ol"
  | "li"
  | "dl"
  | "dt"
  | "dd"
  | "p"
  | "figure"
  | "figcaption"
  | "blockquote"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "form"
  | "fieldset";

// --- Timing -------------------------------------------------------------------------

/**
 * A CSS cubic-bézier timing function for JavaScript-driven motion (the same
 * curve the browser would use). Newton–Raphson with a bisection fallback.
 */
export function motionBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-7) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 60 && hi - lo > 1e-7; i++) {
      if (sampleX(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (progress: number) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    return sampleY(solveT(progress));
  };
}

const easingCache = new Map<MotionEasing, (t: number) => number>();

/** The timing function for an easing token. */
export function motionEasing(name: MotionEasing): (t: number) => number {
  let easing = easingCache.get(name);
  if (!easing) {
    const [x1, y1, x2, y2] = MOTION_EASINGS[name];
    easing = motionBezier(x1, y1, x2, y2);
    easingCache.set(name, easing);
  }
  return easing;
}

/** Delay of the nth item in a stagger: `delay + min(index × step, maxDelay)`. */
export function motionStaggerDelay(
  index: number,
  {
    step = 60,
    maxDelay = 480,
    delay = 0,
  }: { step?: number; maxDelay?: number; delay?: number } = {},
): number {
  return delay + Math.min(Math.max(0, index) * step, maxDelay);
}

// --- Numbers --------------------------------------------------------------------------

/**
 * Fixed so server and client format numbers identically (no hydration
 * mismatch). en-US matches the marketing money helper ("$48,210", not "US$").
 */
export const MOTION_LOCALE = "en-US";

/**
 * A formatter for the in-between values of a count towards `target`. The
 * target itself formats exactly as the caller asked; intermediate values keep
 * the target's number of decimals so the figure doesn't jitter (e.g. 84.2%
 * counts 12.0%, 12.5%, … rather than 12%, 12.47%, …) and never show "-0".
 */
export function motionCountFormatter(
  target: number,
  options: Intl.NumberFormatOptions = {},
  locale: string = MOTION_LOCALE,
): (value: number) => string {
  const exact = new Intl.NumberFormat(locale, options);
  const significant =
    options.minimumSignificantDigits !== undefined ||
    options.maximumSignificantDigits !== undefined;
  let stepper = exact;
  if (!significant && options.notation !== "compact") {
    const decimals =
      exact.formatToParts(target).find((part) => part.type === "fraction")?.value.length ?? 0;
    stepper = new Intl.NumberFormat(locale, {
      ...options,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  const zero = stepper.format(0);
  return (value: number) => {
    if (value === target) return exact.format(target);
    return stepper.format(Math.abs(value)) === zero ? zero : stepper.format(value);
  };
}

// --- Entrances ----------------------------------------------------------------------------

/**
 * What an entrance does when it mounts on the client:
 * - "static": nothing. Motion is off, or the element is already in view and
 *   animates once (content above the fold is never hidden after it painted).
 * - "watch": stays visible but is observed, so it re-arms once it leaves
 *   the viewport (`once` false).
 * - "pending": waits hidden in the pre-state and animates on entering the
 *   viewport. Only for elements below the fold, or client-side `appear` mounts.
 */
export type MotionEntranceStart = "static" | "watch" | "pending";

export function motionEntranceStart({
  allowed,
  inView,
  once,
  appear,
}: {
  /** IntersectionObserver exists and the person hasn't asked to reduce motion. */
  allowed: boolean;
  inView: boolean;
  once: boolean;
  /** `appear` on a client-side mount (never true while hydrating server HTML). */
  appear: boolean;
}): MotionEntranceStart {
  if (!allowed) return "static";
  if (appear || !inView) return "pending";
  return once ? "static" : "watch";
}
