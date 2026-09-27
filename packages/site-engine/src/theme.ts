// The theme engine (docs/architecture/08-themes.md §7, ADR-0030 §7).
//
//   ThemeDefinition (code, first-party) + merchant ThemeSettings (validated)
//        → ResolvedTheme (design tokens) → CSS custom properties on :root
//
// Tokens become custom properties (`color.primary` → `--sv-color-primary`);
// node styles that reference a token compile to `var(--sv-…)`, so a theme
// change restyles every page. Merchants choose from bounded settings only:
// four colours checked for contrast, fonts from an allow-list of system
// stacks (no downloads, no third-party requests), and a few named options.
// There is no merchant CSS anywhere. Pure and client-safe.
import { z } from "zod";

export type ThemeTokens = Readonly<Record<string, string>>;

// ---------------------------------------------------------------------------
// Fonts: system stacks only (modernfontstacks.com), so a theme never loads a
// font file.
// ---------------------------------------------------------------------------

export const FONT_STACKS = {
  "system-sans": {
    label: "System sans-serif",
    stack:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  humanist: {
    label: "Humanist",
    stack: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
  },
  geometric: {
    label: "Geometric",
    stack: 'Avenir, Montserrat, Corbel, "URW Gothic", source-sans-pro, sans-serif',
  },
  "system-serif": {
    label: "System serif",
    stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  "old-style": {
    label: "Old style",
    stack: '"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif',
  },
  transitional: {
    label: "Transitional",
    stack: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif',
  },
  monospace: {
    label: "Monospace",
    stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
} as const;
export type FontKey = keyof typeof FONT_STACKS;
const FONT_KEYS = Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]];

// ---------------------------------------------------------------------------
// Settings.
// ---------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-f]{6}$/;
const colour = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => HEX_RE.test(v), "Use a colour like #1c1917.");

export const THEME_PRESET_KEYS = ["editorial", "minimal", "modern"] as const;
export type ThemePresetKey = (typeof THEME_PRESET_KEYS)[number];

export const themeSettingsShape = z.strictObject({
  preset: z.enum(THEME_PRESET_KEYS),
  colors: z.strictObject({
    background: colour,
    text: colour,
    primary: colour,
    accent: colour,
  }),
  headingFont: z.enum(FONT_KEYS),
  bodyFont: z.enum(FONT_KEYS),
  buttonStyle: z.enum(["solid", "outline", "pill"]),
  radius: z.enum(["none", "small", "medium", "large"]),
  contentWidth: z.enum(["narrow", "standard", "wide"]),
  sectionSpacing: z.enum(["compact", "standard", "spacious"]),
});
export type ThemeSettings = z.infer<typeof themeSettingsShape>;

/** Settings with the accessibility rules applied (contrast between the colours that meet). */
export const themeSettingsSchema = themeSettingsShape.superRefine((settings, ctx) => {
  const { background, text, primary, accent } = settings.colors;
  if (contrastRatio(text, background) < 4.5) {
    ctx.addIssue({
      code: "custom",
      path: ["colors", "text"],
      message: "Text needs more contrast with the background (at least 4.5:1).",
    });
  }
  const buttonMinimum = settings.buttonStyle === "outline" ? 4.5 : 3;
  if (contrastRatio(primary, background) < buttonMinimum) {
    ctx.addIssue({
      code: "custom",
      path: ["colors", "primary"],
      message:
        settings.buttonStyle === "outline"
          ? "Outline buttons show their text in the brand colour: it needs 4.5:1 against the background."
          : "The brand colour needs more contrast with the background (at least 3:1).",
    });
  }
  if (contrastRatio(accent, background) < 3) {
    ctx.addIssue({
      code: "custom",
      path: ["colors", "accent"],
      message: "The accent marks focus and links: it needs 3:1 against the background.",
    });
  }
});

// ---------------------------------------------------------------------------
// Definitions and presets.
// ---------------------------------------------------------------------------

export interface ThemePreset {
  readonly key: ThemePresetKey;
  readonly name: string;
  readonly description: string;
  readonly settings: ThemeSettings;
}

export interface ThemeDefinition {
  readonly key: string;
  readonly name: string;
  readonly presets: readonly ThemePreset[];
  readonly defaultPreset: ThemePresetKey;
}

const PRESETS: readonly ThemePreset[] = [
  {
    key: "editorial",
    name: "Editorial",
    description: "Serif headings, calm spacing and a warm accent.",
    settings: {
      preset: "editorial",
      colors: { background: "#ffffff", text: "#1c1917", primary: "#1c1917", accent: "#9a3412" },
      headingFont: "system-serif",
      bodyFont: "system-sans",
      buttonStyle: "solid",
      radius: "medium",
      contentWidth: "standard",
      sectionSpacing: "standard",
    },
  },
  {
    key: "minimal",
    name: "Minimal",
    description: "One typeface, tight corners and plenty of white space.",
    settings: {
      preset: "minimal",
      colors: { background: "#ffffff", text: "#171717", primary: "#171717", accent: "#2563eb" },
      headingFont: "system-sans",
      bodyFont: "system-sans",
      buttonStyle: "outline",
      radius: "small",
      contentWidth: "narrow",
      sectionSpacing: "spacious",
    },
  },
  {
    key: "modern",
    name: "Modern",
    description: "Geometric type, rounded buttons and a bold brand colour.",
    settings: {
      preset: "modern",
      colors: { background: "#ffffff", text: "#0f172a", primary: "#4338ca", accent: "#0e7490" },
      headingFont: "geometric",
      bodyFont: "humanist",
      buttonStyle: "pill",
      radius: "large",
      contentWidth: "wide",
      sectionSpacing: "standard",
    },
  },
];

/** Storevia's first-party theme (packaged themes arrive with M7). */
export const STOREVIA_THEME: ThemeDefinition = {
  key: "storevia",
  name: "Storevia",
  presets: PRESETS,
  defaultPreset: "editorial",
};

export const THEMES: Readonly<Record<string, ThemeDefinition>> = { storevia: STOREVIA_THEME };

export function themePreset(key: ThemePresetKey, theme = STOREVIA_THEME): ThemePreset {
  const found = theme.presets.find((p) => p.key === key) ?? theme.presets[0];
  if (!found) throw new Error(`theme ${theme.key} has no presets`);
  return found;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = themePreset("editorial").settings;

// ---------------------------------------------------------------------------
// Colour arithmetic (sRGB, WCAG 2.x relative luminance).
// ---------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c ?? 0)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function luminance(colourHex: string): number {
  const [r, g, b] = rgb(colourHex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  if (!HEX_RE.test(a) || !HEX_RE.test(b)) return 1;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `a` moved `amount` (0–1) of the way towards `b`. */
function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return hex([ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount]);
}

/** White or near-black, whichever reads better on `background` (always ≥ 4.5:1). */
function readableOn(background: string): string {
  return contrastRatio("#ffffff", background) >= contrastRatio("#111111", background)
    ? "#ffffff"
    : "#111111";
}

/** The most muted mix of text into background that still keeps 4.5:1. */
function mutedText(text: string, background: string): string {
  for (const amount of [0.4, 0.3, 0.2, 0.1]) {
    const candidate = mix(text, background, amount);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Resolution.
// ---------------------------------------------------------------------------

const RADII = {
  none: ["0", "0", "0"],
  small: ["2px", "4px", "6px"],
  medium: ["4px", "8px", "12px"],
  large: ["8px", "14px", "22px"],
} as const;
const WIDTHS = { narrow: "60rem", standard: "72rem", wide: "84rem" } as const;
const SPACING = { compact: "2.5rem", standard: "4rem", spacious: "6rem" } as const;

/** Settings as the storefront should use them: valid ones as they are, anything else as the default preset. */
export function usableThemeSettings(input: unknown): ThemeSettings {
  const parsed = themeSettingsSchema.safeParse(input);
  return parsed.success ? parsed.data : DEFAULT_THEME_SETTINGS;
}

/** The design tokens for validated settings. */
export function resolveTheme(settings: ThemeSettings): ThemeTokens {
  const { background, text, primary, accent } = settings.colors;
  const onPrimary = readableOn(primary);
  const [sm, md, lg] = RADII[settings.radius];
  const button =
    settings.buttonStyle === "outline"
      ? { background: "transparent", text: primary, border: primary }
      : { background: primary, text: onPrimary, border: primary };
  return {
    "color.primary": primary,
    "color.on-primary": onPrimary,
    "color.secondary": mutedText(text, background),
    "color.accent": accent,
    "color.background": background,
    "color.surface": mix(background, text, 0.04),
    "color.text": text,
    "color.muted": mutedText(text, background),
    "color.border": mix(background, text, 0.14),
    "color.success": "#166534",
    "color.warning": "#92400e",
    "color.danger": "#b91c1c",
    "font.heading": FONT_STACKS[settings.headingFont].stack,
    "font.body": FONT_STACKS[settings.bodyFont].stack,
    "font.mono": FONT_STACKS.monospace.stack,
    "fontSize.xs": "0.75rem",
    "fontSize.sm": "0.875rem",
    "fontSize.base": "1rem",
    "fontSize.lg": "1.125rem",
    "fontSize.xl": "1.25rem",
    "fontSize.2xl": "1.5rem",
    "fontSize.3xl": "1.875rem",
    "fontSize.4xl": "2.5rem",
    "space.xs": "0.25rem",
    "space.sm": "0.5rem",
    "space.md": "1rem",
    "space.lg": "1.5rem",
    "space.xl": "2rem",
    "space.2xl": "3rem",
    "space.3xl": "4.5rem",
    "space.section": SPACING[settings.sectionSpacing],
    "radius.sm": sm,
    "radius.md": md,
    "radius.lg": lg,
    "radius.full": "999px",
    "radius.button": settings.buttonStyle === "pill" ? "999px" : md,
    "button.background": button.background,
    "button.text": button.text,
    "button.border": button.border,
    "shadow.sm": "0 1px 2px rgb(0 0 0 / 0.06)",
    "shadow.md": "0 4px 12px rgb(0 0 0 / 0.08)",
    "container.width": WIDTHS[settings.contentWidth],
    "container.narrow": "44rem",
  };
}

/** The tokens every site renders with until its theme is customised. */
export const DEFAULT_THEME: ThemeTokens = resolveTheme(DEFAULT_THEME_SETTINGS);

export const TOKEN_NAMES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_THEME));

/** Token namespaces a style property may reference. */
export function tokenNamespace(token: string): string {
  return token.slice(0, token.indexOf("."));
}

/** `color.primary` → `--sv-color-primary`. Token names are validated first. */
export function tokenVariable(token: string): string {
  return `--sv-${token.replace(".", "-")}`;
}

// Every value reaching CSS passes this, whatever produced it.
const SAFE_VALUE = /^[A-Za-z0-9#.,%()/\s"'-]+$/;

/** The `:root` block of custom properties for a theme. */
export function themeCss(tokens: ThemeTokens = DEFAULT_THEME): string {
  const declarations = Object.entries(tokens)
    .filter(([name, value]) => TOKEN_NAMES.has(name) && SAFE_VALUE.test(value))
    .map(([name, value]) => `${tokenVariable(name)}:${value}`)
    .join(";");
  return `:root{${declarations}}`;
}
