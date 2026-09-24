# 12. Design system

One visual language for the marketing site, the merchant dashboard,
platform-admin and the future page editor. It lives in `packages/ui`:
tokens in `theme.css`, components in `src/*.tsx`. Every app imports
`@storevia/ui/theme.css` and adds no tokens of its own.

## 1. Direction

Premium, minimal, commercial and restrained. Calm surfaces, crisp type, one
brand colour used sparingly for action and state. No gradients, glass,
glow, illustrations or decorative animation. Nothing is styled to look like
another product. Product imagery is **real UI** (for example the marketing
dashboard previews are rendered from the same navigation definitions the
dashboard uses), never stock art or generated imagery.

## 2. Tokens (`packages/ui/src/theme.css`)

Tailwind v4 `@theme` variables, in two layers:

| Layer      | Examples                                                                                                                                          | Use                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Primitives | `stone-0…950` (warm neutral), `brand-25…950` (deep teal), `danger/warning/success/info-50…700`                                                    | Referenced by semantic tokens; brand and status scales used directly |
| Semantic   | `canvas`, `surface`, `surface-raised`, `subtle`, `muted`, `line`, `line-strong`, `ink`, `ink-muted`, `ink-faint`, `ink-inverse`, `focus`, `admin` | What components use (`bg-surface`, `text-ink-muted`, `border-line`)  |

Other tokens:

- **Typography:** Inter Variable (`@fontsource-variable/inter`, OFL,
  self-hosted, so there is no third-party font request and the CSP stays
  `font-src 'self'`). Character variants `cv01`/`cv11` are on. Sizes
  `xs`–`6xl`, and display sizes carry negative tracking. Figures use
  `.tabular` for aligned numbers.
- **Radius:** `xs` 4, `sm` 6, `control` 8, `card` 14, `panel` 20 and `pill`.
- **Shadow:** `xs`, `card`, `raised` and `popover`. Shadows give subtle
  depth and never glow.
- **Layout:** containers `narrow` 28rem, `prose` 42rem, `content` 72rem and
  `app` 90rem. Breakpoints are sm 640 (large phones), md 768 (tablet
  portrait), lg 1024 (tablet landscape and small laptops), xl 1280 and
  2xl 1536.
- **Motion:** durations `fast` 120, `base` 180 and `slow` 280 ms; easing
  `standard`, `emphasised` and `exit`. Animations `fade-in`, `rise-in`,
  `sheet-in` and `drawer-in` are used only for overlays entering.
  `prefers-reduced-motion` collapses every animation and transition.
- **Focus:** a 2 px `focus` outline with a 2 px offset on `:focus-visible`,
  everywhere.

Every text and background pair meets WCAG 2.2 AA. `ink-faint` (stone-500)
is AA for normal text on white and canvas.

## 3. Components

| Component                                                                  | Notes                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `buttonClasses`                                                  | Variants: `primary`, `secondary`, `ghost`, `danger`, `danger-outline` (opens a high-risk flow) and `inverse` (on dark surfaces). Sizes `sm` 32 px (dense desktop), `md` 40 px and `lg` 48 px (touch). |
| `Input`, `Select`, `Textarea`, `Field`                                     | `Field` wires the label, hint, error and `aria-describedby`                                                                                                                                           |
| `ChoiceCards`                                                              | Radio group rendered as cards (for example the business-type selector); native radios cover the whole card                                                                                            |
| `Card`, `CardHeader`, `CardBody`, `Badge`, `Alert`, `EmptyState`, `Avatar` | Surfaces and status                                                                                                                                                                                   |
| `Meter`, `Stat`, `Kbd`                                                     | Usage against limits (`role="meter"`), labelled figures and key hints                                                                                                                                 |
| `DataList`                                                                 | A table from md up and stacked cards on phones. Desktop tables are never squeezed into 360 px                                                                                                         |
| `Dialog`                                                                   | Radix. `side`: `center`, `bottom` (mobile sheet), `left` (navigation drawer) or `right` (contextual panel)                                                                                            |
| `DropdownMenu*`                                                            | Radix menus                                                                                                                                                                                           |
| `CommandMenu`, `useCommandShortcut`                                        | ⌘K / Ctrl+K jump list (a combobox with a listbox). Lists only the real, permission-filtered destinations the caller passes in                                                                         |

## 4. Icons

- **Interface icons:** Lucide only, rendered through `Icon` or with
  `strokeWidth={ICON_STROKE}` (1.75). Sizes: `xs` 14, `sm` 16, `md` 20,
  `lg` 24 and `xl` 32. Navigation uses 18 px. Icons are decorative
  (`aria-hidden`) unless they stand alone, in which case they take a
  `label`.
- **Storevia glyphs** (`Glyph`, `GlyphTile`) for product concepts: online
  store, business website, publication, portfolio, builder, commerce,
  content, analytics, domains, themes, teams and retail (future POS). They
  are drawn on a 24-unit grid with a 1.5 stroke and round joins, in the
  same line language as Lucide.
- No emoji and no second icon pack. `Logo` has the variants `default`,
  `inverse` and `admin` (the dark staff bar, tagged "Internal").

## 5. Responsive layouts

Each form factor gets its own layout, all from one component tree:

| Surface        | Desktop (≥1024)                                                                                                          | Tablet (768–1023)                                                                                                    | Phone (<768)                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard      | Sidebar (switcher, navigation, organisation section, account); top bar with breadcrumbs, ⌘K and the page's create action | 72 px icon rail and a left drawer with the full navigation; the top bar holds the switcher, search and create action | Compact header (switcher, search, account); bottom bar with the business type's three key areas and "More"; a floating create action on pages that have one |
| Marketing      | Inline navigation                                                                                                        | Menu sheet; the full comparison table                                                                                | Menu sheet; pricing comparison as per-plan disclosure lists                                                                                                 |
| Platform-admin | Dark bar with navigation; tables                                                                                         | Same, with wrapping                                                                                                  | Navigation row under the bar; tables become cards                                                                                                           |

Touch targets are at least 44 px on touch layouts. E2E tests check the
three dashboard layouts and assert there's no horizontal scroll on phones.

## 6. Content rules

- No fabricated data: no invented sales, merchant counts, reviews, logos,
  analytics, AI features, themes or POS integration. Figures come from code
  or the database.
- No dead controls. Unbuilt areas show an honest status ("Soon", "In
  development", "On the roadmap", "Future") and open explanation pages
  with no buttons.
- Marketing statuses come from `apps/marketing/src/content/capabilities.ts`.
  Pricing comes from the plan catalogue (ADR-0025).

## 7. Accessibility

Semantic landmarks with labelled navigation regions, a skip link,
`aria-current` on active navigation, native form controls, Radix dialogs
and menus for focus management, a combobox pattern for the command menu,
native `<details>` disclosures, and meters with ARIA values. Colour is never
the only signal: status badges carry text, and locks carry "not included in
your plan" for screen readers.

## 8. Performance

Server Components by default. Client components are limited to interactive
islands: navigation state, dialogs, the command menu and forms. Fonts are
self-hosted variable fonts, icons are tree-shaken Lucide components, and
there are no raster images.
