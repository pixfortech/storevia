// Product mockups for the marketing site: real design-system components
// filled with the fictional Northwind sample content (sample-data.ts), so
// every page shows the product the same way. Each mockup is one labelled,
// inert image (Mockup); pair any that shows figures with IllustrativeNote.
//
// - DashboardWindow: the merchant dashboard for a business type (hero | full).
// - PhoneAdmin, TabletAdmin: the dashboard's phone and tablet layouts.
// - StorefrontPreview: a storefront in a browser window (sample store).
// - EditorWindow, BuilderPanel: the website builder (sample store).
// - ProductEditor: a product with variants and stock (sample product).
// - PostEditor: a post being written (publishing on the roadmap).
// - AnalyticsCard: a floating figure card (figures the store home shows);
//   ChannelsCard and AnalyticsPreview: planned storefront analytics, only
//   ever shown as a labelled concept with example data.
// - Mockup, WindowFrame, PhoneFrame, TabletFrame, IllustrativeNote: frames
//   for new compositions.
//
// Server components; the charts inside are the design system's client charts.
export { AnalyticsCard, AnalyticsPreview, ChannelsCard } from "./analytics";
export { BuilderPanel, EditorWindow, type EditorWindowProps } from "./builder";
export { DashboardWindow, type DashboardWindowProps } from "./dashboard-window";
export {
  IllustrativeNote,
  Mockup,
  PhoneFrame,
  TabletFrame,
  WindowFrame,
  type WindowFrameProps,
} from "./frame";
export { PhoneAdmin, type PhoneAdminProps } from "./phone-admin";
export { PostEditor } from "./post-editor";
export { ProductArt } from "./product-art";
export { ProductEditor } from "./product-editor";
export { StorefrontPreview, type StorefrontPreviewProps } from "./storefront-preview";
export { TabletAdmin } from "./tablet-admin";
