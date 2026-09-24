// Storevia motion primitives (docs/design/design-plan.md §7).
//
// - motion-core.ts: duration and easing tokens, timing and number helpers
//   (pure, no directive: server components can read and call them).
// - motion-client.tsx: the components and hooks (client: observers, effects).
// - motion.css: keyframes and the .sv-motion-* states (imported by theme.css).
//
// This entry has no "use client" directive on purpose: the tokens and helpers
// stay real values on the server, while the components below are client
// references that server components can still render.
export {
  MOTION_DURATIONS,
  MOTION_EASINGS,
  motionBezier,
  motionCountFormatter,
  motionEasing,
  motionStaggerDelay,
  type MotionDuration,
  type MotionEasing,
  type MotionElement,
} from "./motion-core";
export {
  AnimatedNumber,
  ChartReveal,
  DrawLine,
  FadeIn,
  Float,
  HoverLift,
  Reveal,
  ScaleIn,
  SlideReveal,
  Stagger,
  useInView,
  usePrefersReducedMotion,
  type AnimatedNumberProps,
  type ChartRevealProps,
  type DrawLineProps,
  type FadeInProps,
  type FloatProps,
  type HoverLiftProps,
  type RevealProps,
  type ScaleInProps,
  type SlideDirection,
  type SlideRevealProps,
  type StaggerProps,
  type UseInViewOptions,
} from "./motion-client";
