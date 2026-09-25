import { GlyphTile, Icon, type GlyphName } from "@storevia/ui/icons";
import { Check, ChevronsUpDown, MonitorSmartphone, type LucideIcon } from "lucide-react";

// The desktop panel beside the auth forms: what an account includes today
// (docs/design/design-plan.md: no invented metrics or testimonials; keep in
// step with the marketing site's capabilities).

// Sample sites for the store-switcher composition. Invented names, labelled
// "Illustrative" under the picture; the business types are the real ones.
const SAMPLE_SITES: readonly { glyph: GlyphName; name: string; type: string }[] = [
  { glyph: "online-store", name: "Harbour Goods", type: "Online store" },
  { glyph: "website", name: "Harbour & Co.", type: "Business website" },
  { glyph: "publishing", name: "The Harbour Journal", type: "Publication" },
  { glyph: "portfolio", name: "Studio Harbour", type: "Portfolio" },
];

// Each point's picture: a Storevia glyph where one names the idea, otherwise
// a Lucide icon on the same tile (the website glyph already means a site type
// in the switcher above).
type PointArt = { glyph: GlyphName } | { icon: LucideIcon };

const VALUE_POINTS: readonly (PointArt & { title: string; body: string })[] = [
  {
    glyph: "teams",
    title: "The right access for everyone",
    body: "Roles from owner to author, and access to selected stores only.",
  },
  {
    icon: MonitorSmartphone,
    title: "Built for every screen",
    body: "Designed separately for desktop, tablet and phone.",
  },
];

/** A store switcher with one site of each business type: one decorative image. */
function SiteSwitcherPicture() {
  return (
    <figure>
      <div
        role="img"
        aria-label="Illustration: a store switcher listing four sample sites in one organisation, an online store, a business website, a publication and a portfolio."
      >
        <div
          inert
          className="overflow-hidden rounded-panel border border-line bg-surface shadow-window"
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-control bg-navy-900 font-display text-label text-white">
              H
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label text-ink">Harbour &amp; Co.</span>
              <span className="block text-caption text-ink-faint">Organisation · 4 sites</span>
            </span>
            <Icon icon={ChevronsUpDown} size="sm" className="text-ink-faint" />
          </div>
          <ul className="grid gap-0.5 p-2">
            {SAMPLE_SITES.map((site, index) => (
              <li
                key={site.name}
                className={
                  index === 0
                    ? "flex items-center gap-3 rounded-control bg-brand-25 px-2.5 py-2"
                    : "flex items-center gap-3 rounded-control px-2.5 py-2"
                }
              >
                <GlyphTile
                  name={site.glyph}
                  size="sm"
                  tone={index === 0 ? "brand" : "neutral"}
                  className={index === 0 ? "" : "bg-surface"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {site.name}
                  </span>
                  <span className="block text-caption text-ink-faint">{site.type}</span>
                </span>
                {index === 0 ? <Icon icon={Check} size="sm" className="text-brand-600" /> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3 flex items-center gap-2 text-caption text-ink-faint before:size-1.5 before:rounded-full before:border before:border-neutral-400">
        Illustrative, with sample names
      </figcaption>
    </figure>
  );
}

export function AuthAside() {
  return (
    <aside
      aria-labelledby="auth-aside-title"
      className="hidden border-l border-line bg-subtle lg:flex"
    >
      <div className="m-auto w-full max-w-[31rem] px-12 py-14 xl:px-16">
        <p className="text-overline text-brand-700 uppercase">One platform</p>
        <h2 id="auth-aside-title" className="mt-4 font-display text-h3 text-balance text-ink">
          Every kind of site, run from one account.
        </h2>
        <p className="mt-3 text-body-sm text-ink-muted">
          An online store, a business website, a publication or a portfolio, each set up for what it
          is.
        </p>
        <div className="mt-8">
          <SiteSwitcherPicture />
        </div>
        <ul className="mt-10 grid gap-5">
          {VALUE_POINTS.map((point) => (
            <li key={point.title} className="flex gap-3.5">
              {"glyph" in point ? (
                <GlyphTile name={point.glyph} size="sm" tone="neutral" className="bg-surface" />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface text-ink ring-1 ring-line ring-inset">
                  <Icon icon={point.icon} size="md" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-ink">{point.title}</p>
                <p className="mt-1 text-body-sm text-ink-muted">{point.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
