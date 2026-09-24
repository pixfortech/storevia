"use client";
// Storevia motion components and hooks (motion.tsx is the public entry; the
// tokens and pure helpers are in motion-core.ts). CSS keyframes,
// IntersectionObserver and requestAnimationFrame only: no animation library.
//
// The one rule every primitive follows: server HTML is the final state.
// Nothing is hidden in markup, so content is visible without JavaScript, to
// crawlers and in print. On the client, an element that is below the fold at
// mount is put into a hidden pre-state (data-sv-motion="pending") and animates
// in when it first enters the viewport. Content already in view at mount is
// left alone, so above-the-fold content never flashes or delays LCP. Under
// prefers-reduced-motion nothing is hidden and nothing moves; screenshot and
// end-to-end runs get the final state the same way, by emulating that
// preference.
import {
  Children,
  cloneElement,
  createContext,
  createElement,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
  type RefCallback,
  type RefObject,
  type SVGProps,
} from "react";
import { cn } from "./cn";
import {
  MOTION_LOCALE,
  motionCountFormatter,
  motionEasing,
  motionEntranceStart,
  motionStaggerDelay,
  type MotionDuration,
  type MotionEasing,
  type MotionElement,
} from "./motion-core";

// --- Environment ----------------------------------------------------------------

// useLayoutEffect so a pre-state is applied before the browser paints a
// client-rendered element; useEffect on the server, where neither runs.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function readReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION).matches
  );
}

function noop(): void {
  // Nothing to undo.
}

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return noop;
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/**
 * Whether the user asked the system to reduce motion. False on the server and
 * during hydration, then live (it follows changes to the system setting).
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}

/** Entrance motion needs IntersectionObserver and a person who hasn't opted out. */
function motionAllowed(): boolean {
  return typeof IntersectionObserver !== "undefined" && !readReducedMotion();
}

function isInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const height = window.innerHeight || document.documentElement.clientHeight;
  const width = window.innerWidth || document.documentElement.clientWidth;
  return rect.bottom > 0 && rect.right > 0 && rect.top < height && rect.left < width;
}

const noopSubscribe = () => noop;

/**
 * True when `appear` is set and this component mounted on the client (a
 * replay, a route change, content that arrived later). Never true for a
 * hydration mount: that HTML has already been painted visible.
 */
function useAppearOnClient(appear: boolean): boolean {
  const client = useSyncExternalStore(
    noopSubscribe,
    () => appear,
    () => false,
  );
  const [initial] = useState(client);
  return initial;
}

function useMergedRef<T>(inner: RefObject<T | null>, outer: Ref<T> | undefined): RefCallback<T> {
  return useCallback(
    (value: T | null) => {
      inner.current = value;
      let cleanup: (() => void) | undefined;
      if (typeof outer === "function") {
        const result = outer(value);
        if (typeof result === "function") cleanup = result;
      } else if (outer) {
        outer.current = value;
      }
      return () => {
        inner.current = null;
        if (cleanup) cleanup();
        else if (typeof outer === "function") outer(null);
        else if (outer) outer.current = null;
      };
    },
    [inner, outer],
  );
}

// --- Shared IntersectionObservers ---------------------------------------------------
// One observer per (rootMargin, threshold) pair, shared by every element that
// uses it: a long marketing page can have dozens of reveals.

type ViewListener = (inView: boolean) => void;

interface ViewPool {
  observer: IntersectionObserver;
  listeners: Map<Element, Set<ViewListener>>;
  last: WeakMap<Element, boolean>;
}

const viewPools = new Map<string, ViewPool>();

function observeView(
  element: Element,
  listener: ViewListener,
  rootMargin = "0px",
  threshold = 0,
): () => void {
  const key = `${rootMargin}|${String(threshold)}`;
  let pool = viewPools.get(key);
  if (!pool) {
    const listeners = new Map<Element, Set<ViewListener>>();
    const last = new WeakMap<Element, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const inView = entry.isIntersecting && entry.intersectionRatio >= threshold;
          last.set(entry.target, inView);
          for (const notify of [...(listeners.get(entry.target) ?? [])]) notify(inView);
        }
      },
      { rootMargin, threshold },
    );
    pool = { observer, listeners, last };
    viewPools.set(key, pool);
  }
  const active = pool;
  let set = active.listeners.get(element);
  if (!set) {
    set = new Set();
    active.listeners.set(element, set);
    active.observer.observe(element);
  } else {
    // Already observed by another listener: replay the last known state,
    // because the observer only reports an element when it starts watching.
    const known = active.last.get(element);
    if (known !== undefined) {
      queueMicrotask(() => {
        if (set?.has(listener)) listener(known);
      });
    }
  }
  set.add(listener);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const current = active.listeners.get(element);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      active.listeners.delete(element);
      active.observer.unobserve(element);
    }
    if (active.listeners.size === 0) {
      active.observer.disconnect();
      viewPools.delete(key);
    }
  };
}

export interface UseInViewOptions {
  /** Stay true after the first entrance (default) instead of tracking exits. */
  once?: boolean | undefined;
  /** Grows or shrinks the viewport used for the test, as in IntersectionObserver. */
  rootMargin?: string | undefined;
  /** Share of the element (0–1) that must be visible. */
  threshold?: number | undefined;
}

/**
 * Whether the element is in the viewport. False on the server and until the
 * first observation; true where IntersectionObserver is unavailable.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { once = true, rootMargin = "0px", threshold = 0 }: UseInViewOptions = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const stop = observeView(
      element,
      (visible) => {
        if (visible) {
          setInView(true);
          if (once) stop();
        } else if (!once) {
          setInView(false);
        }
      },
      rootMargin,
      threshold,
    );
    return stop;
  }, [ref, once, rootMargin, threshold]);
  return inView;
}

// --- Entrance engine -----------------------------------------------------------------

const STATE = "data-sv-motion";
/** Entrances that begin within this window of each other share a stagger sequence. */
const STAGGER_WINDOW = 100;

interface StaggerGroup {
  readonly appear: boolean;
  next(): number;
}

const StaggerContext = createContext<StaggerGroup | null>(null);
// Marks drawn inside a ChartReveal are driven by the chart, not observed one by one.
const ChartRevealContext = createContext(false);

interface EntranceConfig {
  disabled?: boolean;
  once: boolean;
  appear: boolean;
  rootMargin: string | undefined;
  threshold: number | undefined;
  stagger: StaggerGroup | null;
  /** Mirror the state on data-revealed (the ChartReveal contract). */
  revealed?: boolean;
}

function useEntrance(node: RefObject<HTMLElement | SVGElement | null>, config: EntranceConfig) {
  const { disabled = false, once, rootMargin, threshold, stagger, revealed = false } = config;
  const animateInView = useAppearOnClient(config.appear);

  useIsomorphicLayoutEffect(() => {
    const element = node.current;
    if (disabled || !element) return;
    const start = motionEntranceStart({
      allowed: motionAllowed(),
      inView: isInViewport(element),
      once,
      appear: animateInView,
    });
    if (start === "static") return;

    const set = (state: "pending" | "in") => {
      element.setAttribute(STATE, state);
      if (revealed) element.setAttribute("data-revealed", state === "in" ? "true" : "false");
    };
    if (start === "pending") set("pending");

    const stop = observeView(
      element,
      (inView) => {
        const pending = element.getAttribute(STATE) === "pending";
        if (inView && pending) {
          const offset = stagger?.next() ?? 0;
          if (offset > 0) element.style.setProperty("--sv-motion-stagger", `${String(offset)}ms`);
          set("in");
          if (once) stop();
        } else if (!inView && !once && !pending) {
          // Re-arm while it is out of sight, so the next entrance animates.
          element.style.removeProperty("--sv-motion-stagger");
          set("pending");
        }
      },
      rootMargin,
      threshold,
    );
    return () => {
      stop();
      element.removeAttribute(STATE);
      element.style.removeProperty("--sv-motion-stagger");
      if (revealed) element.setAttribute("data-revealed", "true");
    };
  }, [node, disabled, once, animateInView, rootMargin, threshold, stagger, revealed]);
}

function durationValue(duration: MotionDuration | number): string {
  return typeof duration === "number" ? `${String(duration)}ms` : `var(--duration-${duration})`;
}

/** Custom properties read by motion.css; only the ones that were set. */
function motionVars(
  vars: Record<string, string | undefined>,
  style: CSSProperties | undefined,
): CSSProperties {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(vars)) if (value !== undefined) out[name] = value;
  return { ...(out as CSSProperties), ...style };
}

interface MotionTimingProps {
  /** Wait before starting, in ms. */
  delay?: number | undefined;
  /** A duration token (fast, base, slow, reveal) or milliseconds. */
  duration?: MotionDuration | number | undefined;
  /** An easing token. Entrances default to emphasised (expo-out). */
  easing?: MotionEasing | undefined;
}

interface MotionViewProps {
  /** Animate on the first entrance only (default). False replays on every entrance. */
  once?: boolean | undefined;
  /**
   * Also animate when already in view at mount, for client-side mounts only
   * (a replay, content that loads later). Server-rendered HTML is never hidden.
   */
  appear?: boolean | undefined;
  /** IntersectionObserver rootMargin (default "0px": any pixel in view). */
  rootMargin?: string | undefined;
  /** IntersectionObserver threshold (default 0). */
  threshold?: number | undefined;
}

interface EntranceBaseProps
  extends HTMLAttributes<HTMLElement>, MotionTimingProps, MotionViewProps {
  /** The element to render (default div). */
  as?: MotionElement | undefined;
  ref?: Ref<HTMLElement> | undefined;
}

function Entrance({
  from,
  as = "div",
  delay,
  duration,
  easing,
  once = true,
  appear,
  rootMargin,
  threshold,
  className,
  style,
  ref,
  children,
  ...rest
}: EntranceBaseProps & { from: string }) {
  const stagger = useContext(StaggerContext);
  const node = useRef<HTMLElement>(null);
  const setRef = useMergedRef(node, ref);
  useEntrance(node, {
    once,
    appear: appear ?? stagger?.appear ?? false,
    rootMargin,
    threshold,
    stagger,
  });
  return createElement(
    as,
    {
      ...rest,
      ref: setRef,
      className: cn("sv-motion", className),
      style: motionVars(
        {
          "--sv-motion-from": from,
          "--sv-motion-delay": delay ? `${String(delay)}ms` : undefined,
          "--sv-motion-duration": duration === undefined ? undefined : durationValue(duration),
          "--sv-motion-ease": easing ? `var(--ease-${easing})` : undefined,
        },
        style,
      ),
    },
    children,
  );
}

// --- Entrances ---------------------------------------------------------------------

export interface RevealProps extends EntranceBaseProps {
  /** Rise distance in px (default 8). */
  distance?: number | undefined;
}

/** Fade and 8 px rise on first view: the default section entrance. */
export function Reveal({ distance = 8, ...props }: RevealProps) {
  return <Entrance {...props} from={`translate3d(0, ${String(distance)}px, 0)`} />;
}

export type FadeInProps = EntranceBaseProps;

/** Opacity only, for content where movement would distract (text over media, tables). */
export function FadeIn(props: FadeInProps) {
  return <Entrance {...props} from="none" />;
}

export type SlideDirection = "up" | "down" | "left" | "right";

export interface SlideRevealProps extends EntranceBaseProps {
  /** The direction the content travels into place (default up). */
  direction?: SlideDirection | undefined;
  /** Travel in px (default 16). */
  distance?: number | undefined;
}

const SLIDE_FROM: Record<SlideDirection, (d: number) => string> = {
  up: (d) => `translate3d(0, ${String(d)}px, 0)`,
  down: (d) => `translate3d(0, ${String(-d)}px, 0)`,
  left: (d) => `translate3d(${String(d)}px, 0, 0)`,
  right: (d) => `translate3d(${String(-d)}px, 0, 0)`,
};

/** A longer, directional entrance for side-by-side compositions (copy beside a visual). */
export function SlideReveal({ direction = "up", distance = 16, ...props }: SlideRevealProps) {
  return <Entrance {...props} from={SLIDE_FROM[direction](distance)} />;
}

export interface ScaleInProps extends EntranceBaseProps {
  /** Starting scale (default 0.97, as the scale-in token). */
  scale?: number | undefined;
}

/** Fade and a slight scale-up, for product windows and media. */
export function ScaleIn({ scale = 0.97, duration = "slow", ...props }: ScaleInProps) {
  return <Entrance {...props} duration={duration} from={`scale(${String(scale)})`} />;
}

export interface StaggerProps extends HTMLAttributes<HTMLElement> {
  as?: MotionElement | undefined;
  /** Delay between consecutive entrances, in ms (default 60). */
  step?: number | undefined;
  /** Cap on the added delay, in ms (default 480), so long lists don't lag. */
  maxDelay?: number | undefined;
  /** Delay before the first item, in ms. */
  delay?: number | undefined;
  /** Pass `appear` to every item (client-side mounts only). */
  appear?: boolean | undefined;
  /** Entrance used to wrap children that aren't already Reveal, FadeIn, SlideReveal or ScaleIn. */
  variant?: "reveal" | "fade" | "scale" | undefined;
  /** Element for those wrappers (default div; use li inside a list). */
  itemAs?: MotionElement | undefined;
  itemClassName?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;
}

/**
 * Staggers the entrances inside it. Items that enter the viewport together
 * (the same row, a replay) start `step` ms apart, in document order; a row
 * that scrolls in later starts its own sequence rather than inheriting a
 * long delay. Plain children are wrapped in `variant`.
 */
export function Stagger({
  as = "div",
  step = 60,
  maxDelay = 480,
  delay = 0,
  appear = false,
  variant = "reveal",
  itemAs = "div",
  itemClassName,
  children,
  ...rest
}: StaggerProps) {
  const timing = useRef({ step, maxDelay, delay });
  useIsomorphicLayoutEffect(() => {
    timing.current = { step, maxDelay, delay };
  }, [step, maxDelay, delay]);
  const [clock] = useState(() => ({ last: -Infinity, index: 0 }));
  const group = useMemo<StaggerGroup>(
    () => ({
      appear,
      next() {
        const now = performance.now();
        clock.index = now - clock.last > STAGGER_WINDOW ? 0 : clock.index + 1;
        clock.last = now;
        return motionStaggerDelay(clock.index, timing.current);
      },
    }),
    [appear, clock],
  );
  const Item = variant === "fade" ? FadeIn : variant === "scale" ? ScaleIn : Reveal;
  const items = Children.map(children, (child) =>
    isValidElement(child) && ENTRANCES.has(child.type) ? (
      child
    ) : (
      <Item as={itemAs} className={itemClassName}>
        {child}
      </Item>
    ),
  );
  return <StaggerContext value={group}>{createElement(as, rest, items)}</StaggerContext>;
}

const ENTRANCES: ReadonlySet<unknown> = new Set([Reveal, FadeIn, SlideReveal, ScaleIn]);

// --- Data -------------------------------------------------------------------------------

export interface AnimatedNumberProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  value: number;
  /** Where the first count starts (default 0). Later changes count from the previous value. */
  from?: number | undefined;
  /** Intl.NumberFormat options (style, currency, fraction digits, notation, …). */
  format?: Intl.NumberFormatOptions | undefined;
  /** BCP 47 locale (default en-US; fixed so server and client agree). */
  locale?: string | undefined;
  /** Count duration in ms (default 900). */
  duration?: number | undefined;
  /** Count even when already in view at mount (client-side mounts only). */
  appear?: boolean | undefined;
  /** Announce value changes politely to assistive technology (off by default). */
  live?: boolean | undefined;
  /** Tabular figures (default) keep the digits from jittering while they count. */
  tabular?: boolean | undefined;
  ref?: Ref<HTMLSpanElement> | undefined;
}

/**
 * A number that counts to its value when it first comes into view. The real,
 * final value is always in the DOM (server HTML, assistive technology,
 * copy/paste) and reserves the width, so nothing shifts; the counting figure
 * is a decorative overlay shown only while it runs.
 */
export function AnimatedNumber({
  value,
  from = 0,
  format,
  locale = MOTION_LOCALE,
  duration = 900,
  appear = false,
  live = false,
  tabular = true,
  className,
  ref,
  ...rest
}: AnimatedNumberProps) {
  // Options usually arrive as an inline object: key the formatter on their content.
  const formatKey = JSON.stringify(format ?? {});
  const formatter = useMemo(
    () => motionCountFormatter(value, format, locale),
    [value, formatKey, locale],
  );
  const root = useRef<HTMLSpanElement>(null);
  const ticker = useRef<HTMLSpanElement>(null);
  const setRef = useMergedRef(root, ref);
  const animateInView = useAppearOnClient(appear);

  // Latest props for the observer and frame callbacks.
  const latest = useRef({ value, formatter, duration });
  // The figure currently on screen; null until mounted, NaN while waiting to enter.
  const shown = useRef<number | null>(null);
  const frame = useRef(0);

  const finish = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    root.current?.removeAttribute("data-sv-counting");
    if (ticker.current) ticker.current.textContent = "";
    shown.current = latest.current.value;
  }, []);

  const count = useCallback(
    (start: number) => {
      const element = root.current;
      const overlay = ticker.current;
      if (!element || !overlay) return;
      cancelAnimationFrame(frame.current);
      const ease = motionEasing("emphasised");
      const began = performance.now();
      element.setAttribute("data-sv-counting", "");
      overlay.textContent = latest.current.formatter(start);
      shown.current = start;
      const tick = (now: number) => {
        const { value: end, formatter: display, duration: span } = latest.current;
        const progress = span > 0 ? Math.min(1, (now - began) / span) : 1;
        if (progress >= 1) {
          finish();
          return;
        }
        const current = start + (end - start) * ease(progress);
        shown.current = current;
        overlay.textContent = display(current);
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [finish],
  );

  // Mount: show the start figure while below the fold, count once it enters.
  useIsomorphicLayoutEffect(() => {
    const element = root.current;
    const overlay = ticker.current;
    shown.current = latest.current.value;
    if (!element || !overlay) return;
    const start = motionEntranceStart({
      allowed: motionAllowed(),
      inView: isInViewport(element),
      once: true,
      appear: animateInView,
    });
    if (start !== "pending") return;
    element.setAttribute("data-sv-counting", "");
    overlay.textContent = latest.current.formatter(from);
    shown.current = Number.NaN;
    const stop = observeView(element, (inView) => {
      if (!inView) return;
      stop();
      count(from);
    });
    return () => {
      stop();
      finish();
    };
    // `from` only matters for the first count, so it is not a dependency.
  }, [animateInView, count, finish]);

  // Value changes: count from what is on screen, if it can be seen.
  useIsomorphicLayoutEffect(() => {
    const previous = latest.current.value;
    latest.current = { value, formatter, duration };
    const current = shown.current;
    if (current === null || Number.isNaN(current) || previous === value) return;
    const element = root.current;
    if (!element || !motionAllowed() || !isInViewport(element)) {
      finish();
      return;
    }
    count(current);
  }, [value, formatter, duration, count, finish]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <span
      {...rest}
      ref={setRef}
      className={cn("sv-motion-number", tabular && "tabular-nums", className)}
    >
      <span className="sv-motion-number-value" aria-live={live ? "polite" : undefined}>
        {formatter(value)}
      </span>
      <span ref={ticker} className="sv-motion-number-ticker" aria-hidden="true" />
    </span>
  );
}

export interface ChartRevealProps
  extends HTMLAttributes<HTMLElement>, MotionTimingProps, MotionViewProps {
  as?: MotionElement | undefined;
  /** Extra delay per mark index (`--sv-motion-i`), in ms (default 40). */
  step?: number | undefined;
  ref?: Ref<HTMLElement> | undefined;
}

/**
 * Reveals chart marks the first time the chart comes into view. Generic: it
 * animates whatever inside it carries a motion.css mark class, so it suits
 * custom chart graphics (product illustrations, hand-drawn sparklines).
 * Storevia's own charts (LineChart, BarChart, …) reveal themselves.
 *
 * Contract (see motion.css):
 * - `.sv-motion-draw`: a solid stroked path with `pathLength={1}`; draws along
 *   its length. (A <DrawLine> inside a ChartReveal does this for you.)
 * - `.sv-motion-grow` / `.sv-motion-grow-x`: a bar grows from its baseline
 *   (bottom / left edge of its own box).
 * - `.sv-motion-wipe`: revealed left to right (areas, dashed lines, groups).
 * - `.sv-motion-fade`: fades in once the draw is under way (dots, labels).
 * - `style={{ "--sv-motion-i": n }}` on a mark adds n × step to its delay.
 * - The root carries `data-revealed`: "true" in server HTML and whenever the
 *   marks are in their final state, "false" only while waiting to enter,
 *   for charts that prefer to drive their own transitions.
 */
export function ChartReveal({
  as = "div",
  delay,
  duration,
  easing,
  once = true,
  appear = false,
  rootMargin,
  threshold,
  step,
  className,
  style,
  ref,
  children,
  ...rest
}: ChartRevealProps) {
  const stagger = useContext(StaggerContext);
  const node = useRef<HTMLElement>(null);
  const setRef = useMergedRef(node, ref);
  useEntrance(node, {
    once,
    appear: appear || (stagger?.appear ?? false),
    rootMargin,
    threshold,
    stagger,
    revealed: true,
  });
  return (
    <ChartRevealContext value={true}>
      {createElement(
        as,
        {
          ...rest,
          ref: setRef,
          "data-revealed": "true",
          className: cn("sv-motion-chart", className),
          style: motionVars(
            {
              "--sv-motion-delay": delay ? `${String(delay)}ms` : undefined,
              "--sv-motion-duration": duration === undefined ? undefined : durationValue(duration),
              "--sv-motion-ease": easing ? `var(--ease-${easing})` : undefined,
              "--sv-motion-step": step === undefined ? undefined : `${String(step)}ms`,
            },
            style,
          ),
        },
        children,
      )}
    </ChartRevealContext>
  );
}

export interface DrawLineProps
  extends Omit<SVGProps<SVGPathElement>, "ref" | "pathLength">, MotionTimingProps, MotionViewProps {
  ref?: Ref<SVGPathElement> | undefined;
}

/**
 * An SVG path that draws itself in on first view (the pathLength=1 dash
 * technique). For solid strokes; reveal dashed lines with `.sv-motion-wipe`.
 * Inside a ChartReveal it follows the chart instead of observing itself.
 */
export function DrawLine({
  delay,
  duration,
  easing,
  once = true,
  appear = false,
  rootMargin,
  threshold,
  className,
  style,
  ref,
  ...rest
}: DrawLineProps) {
  const inChart = useContext(ChartRevealContext);
  const stagger = useContext(StaggerContext);
  const node = useRef<SVGPathElement>(null);
  const setRef = useMergedRef(node, ref);
  useEntrance(node, {
    disabled: inChart,
    once,
    appear: appear || (stagger?.appear ?? false),
    rootMargin,
    threshold,
    stagger,
  });
  return (
    <path
      {...rest}
      ref={setRef}
      pathLength={1}
      className={cn(inChart ? "sv-motion-draw" : "sv-motion-line", className)}
      style={motionVars(
        {
          "--sv-motion-delay": delay ? `${String(delay)}ms` : undefined,
          "--sv-motion-duration": duration === undefined ? undefined : durationValue(duration),
          "--sv-motion-ease": easing ? `var(--ease-${easing})` : undefined,
        },
        style,
      )}
    />
  );
}

// --- Interaction ---------------------------------------------------------------------------

export interface HoverLiftProps extends HTMLAttributes<HTMLElement> {
  as?: MotionElement | undefined;
  /** Apply the lift to the single child element (a link or card) instead of a wrapper. */
  asChild?: boolean | undefined;
}

/**
 * Lifts 2 px with the raised shadow on hover and keyboard focus. Pointer
 * devices with hover only; the shadow stays but the movement goes under
 * reduced motion. The wrapper is card-rounded so the shadow follows a card.
 */
export function HoverLift({
  as = "div",
  asChild = false,
  className,
  children,
  ...rest
}: HoverLiftProps) {
  if (asChild && isValidElement<{ className?: string; style?: CSSProperties }>(children)) {
    return cloneElement(children, {
      ...rest,
      className: cn("sv-motion-lift", children.props.className, className),
      style: { ...children.props.style, ...rest.style },
    });
  }
  return createElement(
    as,
    { ...rest, className: cn("sv-motion-lift rounded-card", className) },
    children,
  );
}

export interface FloatProps extends HTMLAttributes<HTMLElement> {
  as?: MotionElement | undefined;
  /** Offsets the loop, in ms (negative starts mid-cycle), so several floats drift apart. */
  delay?: number | undefined;
  ref?: Ref<HTMLElement> | undefined;
}

/**
 * A slow 6 px float for hero product windows. Paused while off screen and
 * absent under reduced motion.
 */
export function Float({ as = "div", delay, className, style, ref, children, ...rest }: FloatProps) {
  const node = useRef<HTMLElement>(null);
  const setRef = useMergedRef(node, ref);
  useEffect(() => {
    const element = node.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const stop = observeView(element, (inView) => {
      element.toggleAttribute("data-sv-motion-paused", !inView);
    });
    return () => {
      stop();
      element.removeAttribute("data-sv-motion-paused");
    };
  }, []);
  return createElement(
    as,
    {
      ...rest,
      ref: setRef,
      className: cn("sv-motion-float", className),
      style: motionVars(
        { "--sv-motion-float-delay": delay ? `${String(delay)}ms` : undefined },
        style,
      ),
    },
    children,
  );
}
