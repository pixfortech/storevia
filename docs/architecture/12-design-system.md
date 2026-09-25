# 12. Design system

One visual language for the marketing site, the merchant dashboard,
platform-admin and the future page editor. It lives in `packages/ui`:
tokens in `theme.css`, components in `src/*.tsx`. Every app imports
`@storevia/ui/theme.css` and adds no tokens of its own. The design contract
(visual system, IA and per-breakpoint strategy) is
[docs/design/design-plan.md](../design/design-plan.md). A development-only
gallery of every token and component runs at `/design-system` on the
marketing app (it returns 404 in production).

## 1. Direction

White-first, premium, minimal. Premium comes from typography, whitespace,
hierarchy, grids, hairlines and restrained depth, never from colour volume,
gradients (except inside the logo), dark sections, glass, glow or blobs.
Brand blue marks actions, the current selection and data; violet is a rare
second voice; navy carries the type. Product imagery is real UI built from
these components, never stock art or generated imagery.

## 2. Tokens (`packages/ui/src/theme.css`)

Tailwind v4 `@theme static` variables, in two layers:

| Layer      | Examples                                                                                                                                                                                                                                                     | Use                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Primitives | `neutral-0…950` (cool), `navy-50…950`, `brand-25…950` (electric blue), `accent-25…800` (violet), `sky-300…500`, `success/warning/danger/info-50…700`                                                                                                         | Referenced by semantic tokens and by a few components     |
| Semantic   | `canvas`, `surface`, `surface-raised`, `surface-sunken`, `subtle`, `muted`, `line`, `line-strong`, `line-control`, `ink`, `ink-muted`, `ink-faint`, `ink-inverse`, `focus`, `admin`, `chart-1…3`, `chart-muted`, `chart-history`, `chart-grid`, `chart-axis` | What components use (`bg-surface`, `border-line-control`) |

- **Type:** Plus Jakarta Sans (display and headings, `font-display`) and
  Inter (interface, reading, figures), both self-hosted variable fonts, so
  there is no third-party request and the CSP keeps `font-src 'self'`.
  Fifteen roles set size, line height, weight and tracking together:
  `display-xl`, `display-l`, `h1`–`h4`, `body-lg`, `body`, `body-sm`,
  `label`, `caption`, `overline`, `metric`, `metric-lg`, `table`. Columns
  of figures use tabular numerals.
- **Radius:** `xs` 4, `sm` 6, `control` 8, `card` 12, `panel` 16, `pill`.
- **Depth:** a hairline first, then `shadow-card`, `raised` (hover),
  `popover` (menus) and `window` (dialogs, product mockups).
- **Layout:** containers `narrow` 28rem, `prose` 42rem, `content` 76rem
  (1216 px), `app` 90rem and `wide` 100rem. Breakpoints sm 640, md 768,
  lg 1024, xl 1280, 2xl 1536. z-index variables `--z-sticky` 30 to
  `--z-toast` 70.
- **Motion:** durations `fast` 120, `base` 200, `slow` 320 and `reveal`
  640 ms; easings `standard`, `emphasised` and `exit`.
  `prefers-reduced-motion` collapses every animation and transition.
- **Focus:** a 2 px `focus` outline with an offset on `:focus-visible`;
  fields add a brand border and a soft ring.

`tailwind-merge` knows the custom roles, radii and shadows (`cn()`), so a
component's classes can be overridden safely.

## 3. Components and entry points

Apps import each component from its own entry point, never from a barrel:

```ts
import { Button } from "@storevia/ui/button";
import { Dialog } from "@storevia/ui/overlays";
```

`@storevia/ui` has no root export. A barrel that re-exports client modules
makes Next.js ship every one of them on every page that imports it (the
marketing home page loaded toast, dropdown-menu, popover and combobox code it
never rendered). Each entry point is one module, so a page ships only the
client code it uses. `package-exports.test.ts` checks that every public
module is an entry point and no internal one is.

| Entry point (`@storevia/ui/…`)      | Components                                                                                                                                                                      | Kind                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `icons`                             | `Logo`, `LogoMark`, `Icon`, `Glyph`, `GlyphTile`, `LOGO_SLANT`                                                                                                                  | server-safe                 |
| `illustrations`                     | `Illustration` (empty and status states), `BusinessScene`                                                                                                                       | server-safe                 |
| `button`, `spinner`                 | `Button`, `IconButton`, `ButtonGroup`, `buttonClasses`; `Spinner`                                                                                                               | server-safe                 |
| `surfaces`                          | `Card` family, `PageHeader`, `SectionHeader`, `Badge`, `ExampleDataBadge`, `StatusDot`, `Alert`, `EmptyState`, `Skeleton`, `Avatar`, `AvatarGroup`, `Divider`, `VisuallyHidden` | server-safe                 |
| `data`                              | `Metric`, `KpiCard`, `UsageMeter`, `Meter`, `Stat`, `Kbd`, `Table` primitives, `DataList`, `DescriptionList`                                                                    | server-safe                 |
| `charts`                            | `LineChart`, `AreaChart`, `BarChart`, `DonutChart`, `Sparkline`, `ChartCard`, `ChartLegend`, `ChartTable`, `ChartEmpty`                                                         | server entry, client plots  |
| `motion`                            | `Reveal`, `FadeIn`, `SlideReveal`, `ScaleIn`, `Stagger`, `AnimatedNumber`, `ChartReveal`, `DrawLine`, `HoverLift`, `Float`, `useInView`, `usePrefersReducedMotion`              | server entry, client island |
| `command-preview`                   | `CommandMenuPreview` (static, inert)                                                                                                                                            | server-safe                 |
| `control-helpers`, `cn`             | `paginationRange`, `dateRangeBounds`; `cn`                                                                                                                                      | server-safe                 |
| `form`                              | `Input`, `Textarea`, `Select`, `Field`, `SearchInput`                                                                                                                           | client                      |
| `combobox`, `date-range-picker`     | `Combobox`; `DateRangePicker`                                                                                                                                                   | client                      |
| `choice`                            | `Checkbox`, `RadioGroup`/`RadioItem`, `Switch`                                                                                                                                  | client                      |
| `choice-cards`, `segmented-control` | `ChoiceCards`; `SegmentedControl`                                                                                                                                               | client                      |
| `navigation`                        | `Tabs`, `Breadcrumb`, `Pagination`                                                                                                                                              | client                      |
| `navigation-menu`                   | `NavigationMenu*` (marketing mega-menus)                                                                                                                                        | client                      |
| `feedback`, `popover`, `toast`      | `Tooltip`, `Progress`; `Popover`; `ToastProvider`, `Toaster`, `useToast`                                                                                                        | client                      |
| `overlays`, `dropdown-menu`         | `Dialog`, `Drawer`, `Sheet`; `DropdownMenu*`                                                                                                                                    | client                      |
| `command`                           | `CommandMenu` (⌘K / Ctrl+K), `useCommandShortcut`, `commandResults`                                                                                                             | client                      |

Internal modules (`form-core`, `command-parts`, `chart-*`, `motion-core`,
`motion-client`, `overlays-focus`, `overlays-shared`, `data-scroll`) are
not entry points. A new public module gets its own entry in
`packages/ui/package.json`; the test fails until it does. Keep modules that
pages use independently apart: a client module ships whole.

## 4. Icons, glyphs and illustrations

- **Interface icons:** Lucide only, through `<Icon>`. Sizes `xs` 14, `sm`
  16, `nav` 18, `md` 20, `lg` 24 and `xl` 32; the stroke is 1.75, and 1.5 at 32. Icons are decorative unless they stand alone, when they take a
  `label`.
- **The mark:** `Logo` and `LogoMark` recreate the supplied logo exactly as
  described in the design plan (§6): a ribbon folded into an S with
  alternating slants, gradient bands and a navy wordmark with an
  electric-blue i-dot. Variants `default`, `inverse` (dark surfaces) and
  `admin`, plus an optional `tag` pill. The wordmark is outlined paths
  named by `aria-label="Storevia"`, so the i-dot survives forced-colours
  mode and nothing reads it as "Storevıa".
- **Storevia glyphs** (`Glyph`, `GlyphTile`) and **illustrations**
  (`Illustration`, `BusinessScene`) are drawn in the mark's ribbon grammar:
  bands at the mark's slant (`LOGO_SLANT`, 1 in 6), round folds, flat cut
  ends, one accent per piece. No stock art, no emoji, no second icon pack.
- **App icons:** each app serves `favicon.ico`, `icon1.svg`, `icon2.png`
  and `apple-icon.png` from `src/app/` (platform-admin's carry an amber
  staff badge). The request proxies skip these files like `favicon.ico`.

## 5. Responsive layouts

The dashboard, marketing and platform-admin surfaces are being redesigned
on this system; the per-breakpoint strategy (desktop sidebar, tablet rail
and drawer, app-like phone layouts with bottom navigation) is in the design
plan §10–12. Touch targets are at least 44 px on touch layouts (48 px in
bottom navigation), and no page may scroll horizontally at 320 px and up.

## 6. Content rules

- No fabricated data: no invented sales, merchant counts, reviews, logos,
  analytics, AI features, themes or POS integration. Figures come from code
  or the database.
- Example figures appear only in clearly labelled development previews and
  galleries, always marked with `ExampleDataBadge` ("Example data").
- No dead controls. Unbuilt areas show an honest status and open
  explanation pages with no buttons. Marketing uses "Available now", "Up
  next" (scheduled, not started), "On the roadmap" and "Future"; the
  dashboard says "Soon" or names the milestone.
- Marketing statuses come from `apps/marketing/src/content/capabilities.ts`.
  Pricing comes from the plan catalogue (ADR-0025).

## 7. Accessibility

- WCAG 2.2 AA. `theme.test.ts` checks the text pairs components use at
  4.5:1, and control boundaries and chart series at 3:1, against the real
  token values.
- Semantic landmarks, labelled navigation regions, a skip link and
  `aria-current`; Radix for dialogs, menus, popovers, tabs and toggles.
- Keyboard: arrow keys in tabs, radios, segmented controls, menus, the
  combobox and chart tooltips; Escape closes the top layer and focus returns
  to its trigger, including when a newer modal opened while an older layer
  was closing.
- Colour is never the only signal: status carries text or an icon, locks
  carry "not included in your plan", history series are dashed, and every
  chart has a legend and a table view.
- Forced-colours mode keeps every state visible (borders or outlines, not
  only fills). Reduced motion renders entrances in their final state.

## 8. Performance

Server Components by default; client components are interactive islands.
Fonts are self-hosted, icons are tree-shaken Lucide components, charts are
plain SVG, and motion uses CSS and IntersectionObserver with no animation
library. Per-module entry points (§3) keep each page to the client code it
renders.

Measured on production builds with every Next server restarted and each
loaded chunk checked against the build on disk (uncompressed JavaScript,
with transferred bytes in brackets):

| Page                 | Barrel (f42a3b2)  | Entry points      |
| -------------------- | ----------------- | ----------------- |
| Marketing home       | 800 KiB (252 KiB) | 664 KiB (206 KiB) |
| Marketing /products  | 800 KiB (252 KiB) | 664 KiB (206 KiB) |
| Marketing /pricing   | 665 KiB (205 KiB) | 650 KiB (200 KiB) |
| Marketing /contact   | 723 KiB (226 KiB) | 647 KiB (200 KiB) |
| Dashboard sign-in    | 685 KiB (213 KiB) | 577 KiB (178 KiB) |
| Dashboard store home | 837 KiB (258 KiB) | 765 KiB (239 KiB) |

About 450 KiB of each page is React and the Next.js runtime. Lighthouse
(simulated mobile, median of three): home 86 → 88, /products 90 → 93,
dashboard sign-in 91 → 95; accessibility 100.

Remaining weight is code the page renders: the marketing header's
mega-menu and phone-menu dialog on every marketing page, and on the store
home the dashboard shell (menus, command menu, tooltips) plus the chart
components the example preview draws, which production pages load even
though they show no charts yet. Loading those widgets on demand is an app
change, left for when real analytics arrive.
