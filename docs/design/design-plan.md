# Storevia design plan: visual reset (M2.5 design review)

The design contract for every Storevia surface: the marketing site, the
merchant dashboard, platform-admin, auth and the future editor. The tokens
live in `packages/ui/src/theme.css` and the components in `packages/ui`.
Surfaces compose shared components instead of adding one-off styling.

## 1. What's wrong with the current UI

- It reads as a competent template, not a brand. The warm grey and teal have
  no link to the Storevia mark, and the type is one generic face.
- Hierarchy is flat. Every section is the same card grid with the same weight,
  and nothing leads the eye.
- The marketing site is shallow. It says little about what Storevia is, who
  it's for, how plans differ or how teams work, and its product visuals are
  thin.
- The dashboard home is a setup checklist. There's no "business at a glance",
  no data language and no per-business-type composition.
- Components are basic. There are no tooltips, tabs, toasts, switches or
  charts, overlays are plain, and motion is almost nil.
- Platform-admin's dark bar feels heavy, and operational density is uneven.

## 2. Visual system

White-first and quiet. Premium comes from typography, whitespace, precise
grids, hairlines and restrained depth, never from colour volume. Brand colour
marks action, selection and data. Violet is a rare second voice. Navy carries
the type. No large dark sections, gradients (except the logo), glass, glow or
blobs.

## 3. Typography

- **Display and headings:** Plus Jakarta Sans (geometric, like the wordmark).
- **Interface, reading and figures:** Inter.

Both are self-hosted variable fonts.

| Role         | Size / line height       | Weight | Tracking  |
| ------------ | ------------------------ | ------ | --------- |
| `display-xl` | 64 / 1.05 (40 on phones) | 650    | −3.5%     |
| `display-l`  | 52 / 1.08                | 650    | −3%       |
| `h1`         | 40 / 1.12                | 650    | −2.5%     |
| `h2`         | 32 / 1.18                | 650    | −2.2%     |
| `h3`         | 24 / 1.25                | 620    | −1.5%     |
| `h4`         | 19 / 1.4                 | 620    | −1%       |
| `body-lg`    | 18 / 1.65                | 400    |           |
| `body`       | 16 / 1.6                 | 400    |           |
| `body-sm`    | 14 / 1.5                 | 400    |           |
| `label`      | 13 / 1.35                | 550    |           |
| `caption`    | 12 / 1.35                | 400    |           |
| `overline`   | 11 / 1.3                 | 600    | +8%, caps |
| `metric`     | 28 / 1.15                | 620    | −2%       |
| `metric-lg`  | 44 / 1.05                | 650    | −3%       |
| `table`      | 13 / 1.4                 | 400    | tabular   |

Headings use `font-display`. Figures use Inter: proportional for hero and KPI
values, tabular in columns.

## 4. Colour system

Tokens are in `theme.css`. Every text/background pair is AA-tested in
`theme.test.ts`.

- **Surfaces:** `canvas` and `surface` are pure white; `surface-sunken` and
  `subtle` are `#F6F7FA`; `muted` is `#EFF1F6`.
- **Lines:** `line` is `#E6E9F0` (hairlines); `line-strong` is `#DCE0E9`
  (controls).
- **Ink:** `ink` is navy `#0B1530` (the wordmark); `ink-muted` is `#4A5368`;
  `ink-faint` is `#5F687C`.
- **Brand (electric blue):** `brand-500` is `#3355FF`; `brand-600` is
  `#2447F0` (actions, 6.5:1 on white).
- **Accent (violet):** `accent-400` is `#A07CFF`; `accent-600` is `#7452EE`.
  Use it sparingly: comparison data, a rare highlight.
- **Sky** (`#33C2FF`): logo and illustration highlights only.
- **Status:** `success`, `warning`, `danger` and `info`. Always shown with an
  icon or label, never used as data series.
- **Charts:** `chart-1` is `#3355FF` (primary), `chart-2` is `#A07CFF`
  (comparison), `chart-muted` is `#C4CAD6` (history), `chart-grid` is
  `#EFF1F6`. The pair passes the CVD validator; violet contrast is 3:1, so
  charts always carry a legend and a table fallback.

## 5. Spacing and grid

- **Spacing:** a 4 px base (Tailwind scale). Rhythm steps are 4, 8, 12, 16,
  24, 32, 48, 64, 96 and 128.
- **Marketing:** a 12-column grid, content width 1216 px (`container-content`)
  with 24 px gutters (16 px on phones). Section spacing is 128 px on desktop,
  96 on tablet and 72 on phones.
- **App:** workspace maximum 1440 px (`container-app`), 32 px page padding on
  desktop, 24 on tablet and 16 on phones. Cards use a 24 px gap on desktop
  and 16 below.
- **Radius:** 8 (controls), 12 (cards), 16 (product windows and sheets), pill
  (chips and badges). Avoid pillowy radii.
- **Depth:** a hairline border first, then shadow `card` (almost invisible),
  `raised` (hover), `popover` (menus) and `window` (product mockups).
- **z-index:** `--z-sticky` 30, `--z-overlay` 40, `--z-modal` 50,
  `--z-popover` 60, `--z-toast` 70.

## 6. Icon system

### The Storevia mark

`Logo` and `LogoMark` in `packages/ui` recreate the supplied logo, which exists
only as an image. The official vector replaces the recreation when it's
available. What the recreation must match:

- **Form:** one ribbon folded into an "S". Three thick bands of equal width
  are joined by two round folds, as if a strip of ribbon were folded back on
  itself twice.
- **Slants alternate.** The top band rises to the right (/), the middle band
  falls to the right (\\) and the bottom band rises to the right (/). The top
  and bottom bands are parallel to each other; the middle band is not. Don't
  redraw the mark with three parallel bands: that is a different logo.
- **Gaps:** because the slants alternate, each gap between two bands is a
  wedge that narrows towards the fold joining them. The fold keeps a small,
  visible counter; it never closes to a hairline.
- **Top band:** deep blue `#1F3BE8` (left) to sky cyan `#29C5FF` (top right),
  with a flat vertical cut at its top-right end. It folds round at the left
  into the middle band.
- **Middle band:** light blue `#4FA8FF` (left) to deep blue `#1A3BD9`
  (right). It folds round at the right into the bottom band.
- **Bottom band:** violet, `#9B6BFF` to `#6E6BFF`, with a translucent overlap
  near the right fold and a flat vertical cut at its bottom-left end.
- **Wordmark:** "Storevia" in a bold geometric sans (Plus Jakarta Sans 700),
  navy `#0B1530`. The dot of the "i" is an electric-blue circle, `#4A67FF`.
- **Craft:** each fold meets its bands tangentially with no visible seam in
  outline or colour (continuous or matched gradients). The mark stays legible
  from 16 px up.

### Interface icons and glyphs

- **Interface:** Lucide only, through `<Icon>`. Sizes are 16, 18 (navigation),
  20, 24 and 32. The stroke is 1.75 at 16–24 and 1.5 at 32. Icons are
  decorative unless they carry meaning alone, in which case they take a
  label.
- **Storevia glyphs:** product concepts drawn on the mark's ribbon geometry:
  slanted bands at the mark's slant, round folds and flat cut ends. The set covers
  website, commerce, publishing, portfolio, analytics, teams, domains, themes,
  integrations, retail, builder and content. Illustrations are 1.5 stroke on
  a 24 grid, inked in navy with one blue or violet accent stroke.
- **Empty-state illustrations:** the same language at 96–120 px. No stock art
  and no emoji.

## 7. Motion language

- **Purpose only:** entrance, feedback, orientation and continuity.
- **Durations:** 120 (hover and press), 200 (menus and toggles), 320 (panels
  and sheets) and 640 (section reveals). Easing is `emphasised` (expo-out) for
  entrances and `standard` for state changes.
- **Primitives** (`packages/ui/motion`): `Reveal` (fade and 8 px rise),
  `Stagger`, `ScaleIn`, `AnimatedNumber`, `ChartReveal` (line draw and bar
  grow) and `HoverLift`.
- **Rules:** entrance motion only on first view, driven by
  IntersectionObserver, CSS or WAAPI (no animation library). The hero product
  window floats at most 6 px. Under `prefers-reduced-motion` everything
  renders in its final state.

## 8. Marketing IA

- **Header:** Products (mega-menu), Solutions (mega-menu), Pricing, Resources
  (menu) and Company (menu), plus Log in and Start free. Sticky white header
  with a hairline on scroll.
- **Pages:**
  - `/` (17 sections)
  - `/products`, `/solutions` (with an anchor per business type) and
    `/features` (the full capability matrix, each capability with its status)
  - `/pricing` (plan cards, interval treatment, comparison, FAQ, all from the
    plan catalogue)
  - `/resources` (roadmap and security), `/changelog` (real release history)
  - `/about`, `/contact`, legal placeholders, `/login` and `/signup`
- **Honesty:** every capability shows _Available_, _In development_ or _On the
  roadmap_. Product visuals that show example data say so ("Example data").

## 9. Dashboard IA

- **Sidebar:**
  - Logo and store selector at the top.
  - Primary areas come from the business type, grouped as Overview, then
    Sell or Content, then Website, then Grow.
  - Secondary items: Apps and Settings.
  - At the bottom: the plan indicator (usage) and the account.
  - Permission-filtered; plan-locked areas show a lock; unbuilt areas say
    "Soon".
- **Top bar:** breadcrumbs, search / ⌘K, notifications placeholder (none
  until notifications exist) and the page's primary action.
- **Home:** a widget registry (`lib/dashboard`). Each widget declares its data
  source, the business types it suits, its size and its empty state. A layout
  per business type orders the widgets, with room for user preferences
  (hide, reorder, density) later.
  - Real data: store status, setup tasks, plan usage, team, recent activity
    (audit trail) and website status.
  - Domains that don't exist yet (revenue, orders, visitors, conversion, top
    products or posts) render an honest "not collecting yet" chart frame.
    Development builds can show clearly badged example data on request
    (`?preview=example`); production never shows invented numbers.
- **Three independent dimensions:** business type decides presentation, plan
  entitlements decide commercial access, and RBAC decides authorisation.

## 10. Desktop

A 264 px sidebar, a 56 px top bar and a 12-column workspace. KPI row of 4–5
tiles, then one primary chart (spanning 8 columns) beside a 4-column side
rail, then secondary modules. Tables are full, with sticky headers.

## 11. Tablet (768–1023)

A 72 px icon rail with a full navigation drawer. Two-column dashboard grid,
KPIs in 2×2 or 3×2, charts full width. Touch targets are at least 44 px,
tables collapse secondary columns, and filters move into a sheet.

## 12. Mobile (<768)

- An app layout, not a shrunken desktop.
- Compact top bar: logo mark, store switcher, account.
- KPIs in a horizontal snap row, or as a 2×2 grid.
- Charts simplified: fewer ticks, a sparkline-first view that expands in a
  sheet.
- Lists become cards.
- Bottom bar: Home, the type's primary area (Orders or Content), Create
  (centre), Website and More, with secondary navigation in bottom sheets.
- Targets are at least 48 px, and safe-area insets are respected.
- Marketing on phones:
  - a strong stacked hero with a product visual below the copy;
  - a full-screen navigation drawer;
  - pricing as a plan switcher with grouped comparisons.
