// Shared marketing primitives: every public page composes these (and the
// product mockups in components/product) instead of styling sections itself,
// so rhythm, type and container edges stay identical across the site.
//
// - Container / CONTAINER_CLASS: the one content width and side padding
//   (header, footer and sections all use it).
// - Section: a named region with the standard vertical rhythm; tone
//   "tinted" is the quiet grey band.
// - SectionHeading: eyebrow, title (h1/h2/h3), lead, optional status and
//   actions.
// - PageHero: the top of every inner page (the page's h1, lead, actions and
//   an optional visual, stacked or split).
// - SplitFeature: copy beside a product visual; alternate `reverse`.
// - FeatureRail: a row of features under hairline rules, with statuses.
// - StatusPill: a capability status from content/capabilities.ts.
// - ArrowLink: "Compare every feature →".
// - CTASection: the closing call to action.
//
// Server components (motion inside them is the design system's client
// primitives). CTASection reads the server environment, so client components
// import the file they need (e.g. ./status-pill) rather than this index.
// Statuses always come from content/capabilities.ts.
export { ArrowLink, type ArrowLinkProps } from "./arrow-link";
export { CTASection, type CTASectionProps } from "./cta-section";
export { FeatureRail, type FeatureRailItem, type FeatureRailProps } from "./feature-rail";
export { PageHero, type PageHeroProps } from "./page-hero";
export {
  Container,
  CONTAINER_CLASS,
  Section,
  SectionHeading,
  type SectionHeadingProps,
  type SectionProps,
  type SectionSpace,
  type SectionTone,
} from "./section";
export { SplitFeature, type SplitFeatureProps, type SplitFeaturePoint } from "./split-feature";
export { StatusPill, type StatusPillProps } from "./status-pill";
