// The theme engine (docs/architecture/08-themes.md §9–§10, ADR-0030 §7).
//
//   ThemeDefinition (first-party code) + merchant ThemeSettings (validated)
//        → ResolvedTheme (design tokens) → CSS custom properties on :root
//        + the theme's own chrome variant and scoped first-party stylesheet
//
// Tokens become custom properties (`color.primary` → `--sv-color-primary`);
// node styles that reference a token compile to `var(--sv-…)`, so a theme
// change restyles every page. Merchants choose from bounded settings only:
// four colours checked for contrast, fonts from an allow-list of system
// stacks (no downloads, no third-party requests), and a few named options.
// There is no merchant CSS anywhere, and no merchant-supplied theme code:
// a theme is a ThemeDefinition in this repository. Pure and client-safe.
//
// This module is the engine; the theme packages live in ./themes and the
// registry in ./theme (the public import path).
import { z } from "zod";

export type ThemeTokens = Readonly<Record<string, string>>;

/**
 * The contract between theme packages and the renderer: the token set,
 * the settings fields, the chrome slots (header, footer, menus) and the
 * class names blocks render. Raised when a change would break a theme built
 * for the previous contract; a theme lists the versions it supports.
 */
export const THEME_ENGINE_VERSION = 1;

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
// Settings. Every theme shares the bounded fields; its presets are its own,
// so each theme has its own schema (`ThemeDefinition.settingsSchema`).
// ---------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-f]{6}$/;
const colour = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => HEX_RE.test(v), "Use a colour like #1c1917.");

const SETTINGS_FIELDS = {
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
};

/** Settings of any theme (the preset key is the theme's own). */
export type ThemeSettings = { preset: string } & z.infer<z.ZodObject<typeof SETTINGS_FIELDS>>;
export type ThemeSettingsSchema = z.ZodType<ThemeSettings>;

/** The strict settings shape for a theme with these preset keys (no contrast rules). */
export function themeSettingsShapeFor<const K extends string>(presetKeys: readonly [K, ...K[]]) {
  return z.strictObject({ preset: z.enum(presetKeys), ...SETTINGS_FIELDS });
}

/** The accessibility rules every theme's settings follow (contrast between the colours that meet). */
function contrastRules(settings: ThemeSettings, ctx: z.RefinementCtx): void {
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
}

/** A theme's settings schema: its presets, the shared bounded fields and the contrast rules. */
export function themeSettingsSchemaFor<const K extends string>(presetKeys: readonly [K, ...K[]]) {
  return themeSettingsShapeFor(presetKeys).superRefine(contrastRules);
}

// ---------------------------------------------------------------------------
// The theme package contract.
// ---------------------------------------------------------------------------

export interface ThemePreset {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly settings: ThemeSettings;
}

/** What a theme renders against: the engine contract and the page-document schema. */
export interface ThemeCompatibility {
  /** THEME_ENGINE_VERSION values the theme was built for. */
  readonly engine: readonly number[];
  /** Page-document schemaVersion values whose documents it renders (@storevia/editor DOCUMENT_SCHEMA_VERSION). */
  readonly documentSchema: readonly number[];
}

/**
 * Renderer capabilities: which first-party chrome variant the Site Engine
 * renders for the theme, and which presentation its stylesheet gives the
 * shared blocks. Every theme renders every registered block and every page
 * kind (the class names are the engine contract); these only choose among
 * the variants the engine and its stylesheet implement.
 */
export interface ThemeChrome {
  /** inline: name, menu and actions on one row. centred: the name centred above the menu. */
  readonly header: "inline" | "centred";
  /** Menu links as written, or small uppercase letter-spaced links. */
  readonly navigation: "plain" | "uppercase";
  readonly footer: "inline" | "centred";
  /** square cards with the title below, or tall portrait cards with centred serif titles. */
  readonly productCard: "square" | "portrait";
  /** Two equal columns, or a wide gallery with a sticky details column. */
  readonly productPage: "split" | "gallery";
}

export interface ThemeDefinition {
  /** Stable key stored on StoreTheme.themeKey (^[a-z][a-z0-9-]{1,40}$). */
  readonly key: string;
  /** Integer release of this theme package; stored settings record the one they were saved for. */
  readonly version: number;
  readonly name: string;
  readonly description: string;
  /** Themes are first-party code: always Storevia. */
  readonly author: "Storevia";
  readonly compatibility: ThemeCompatibility;
  readonly presets: readonly ThemePreset[];
  readonly defaultPreset: string;
  /** The settings this theme accepts (strict, bounded, contrast-checked). */
  readonly settingsSchema: ThemeSettingsSchema;
  readonly chrome: ThemeChrome;
  /**
   * First-party CSS applied after the shared block styles, every selector
   * scoped under `[data-sv-theme="<key>"]`, driven by the tokens. Static
   * and reviewed like any code; merchants never supply CSS.
   */
  readonly stylesheet: string;
  /**
   * Upgrades settings saved for an older version of this theme (which may
   * no longer match its schema). The result is validated like any input; a
   * theme without migrations just revalidates.
   */
  readonly migrateSettings?: (settings: unknown, fromVersion: number) => unknown;
}

const THEME_KEY_RE = /^[a-z][a-z0-9-]{1,40}$/;
const FORBIDDEN_CSS = /@import|url\s*\(|expression\s*\(|javascript:|<|behavior\s*:/i;

/** Problems with a theme definition itself (empty when it keeps the contract). */
export function themeDefinitionProblems(theme: ThemeDefinition): string[] {
  const problems: string[] = [];
  if (!THEME_KEY_RE.test(theme.key)) problems.push("key must match ^[a-z][a-z0-9-]{1,40}$");
  if (!Number.isInteger(theme.version) || theme.version < 1)
    problems.push("version must be a positive integer");
  if ((theme.author as string) !== "Storevia") problems.push("themes are first-party");
  if (theme.compatibility.engine.length === 0 || theme.compatibility.documentSchema.length === 0)
    problems.push("compatibility must list engine and document schema versions");
  if (theme.presets.length === 0) problems.push("a theme needs at least one preset");
  if (!theme.presets.some((p) => p.key === theme.defaultPreset))
    problems.push("defaultPreset must be one of the presets");
  if (new Set(theme.presets.map((p) => p.key)).size !== theme.presets.length)
    problems.push("preset keys must be unique");
  for (const preset of theme.presets) {
    const parsed = theme.settingsSchema.safeParse(preset.settings);
    if (!parsed.success) problems.push(`preset ${preset.key} fails the theme's settings schema`);
    else if (preset.settings.preset !== preset.key)
      problems.push(`preset ${preset.key} must name itself`);
  }
  if (FORBIDDEN_CSS.test(theme.stylesheet))
    problems.push("the stylesheet may not import, load URLs or contain markup");
  return problems;
}

/** Checks a definition when it is declared (a broken first-party theme fails at build and test time). */
export function defineTheme(theme: ThemeDefinition): ThemeDefinition {
  const problems = themeDefinitionProblems(theme);
  if (problems.length > 0) throw new Error(`theme ${theme.key}: ${problems.join("; ")}`);
  return Object.freeze(theme);
}

/** The platform a theme must be compatible with. */
export interface ThemePlatform {
  readonly engine: number;
  readonly documentSchema: number;
}

/** Why the theme can't be used on this platform, or null when it can. */
export function themeCompatibilityIssue(
  theme: ThemeDefinition,
  platform: ThemePlatform,
): string | null {
  if (!theme.compatibility.engine.includes(platform.engine)) {
    return `${theme.name} ${String(theme.version)} was built for another version of the Storevia theme engine, so it can't be used yet.`;
  }
  if (!theme.compatibility.documentSchema.includes(platform.documentSchema)) {
    return `${theme.name} ${String(theme.version)} doesn't support this version of Storevia's pages, so it can't be used yet.`;
  }
  return null;
}

export function themePreset(theme: ThemeDefinition, key?: string): ThemePreset {
  const found =
    theme.presets.find((p) => p.key === (key ?? theme.defaultPreset)) ??
    theme.presets.find((p) => p.key === theme.defaultPreset) ??
    theme.presets[0];
  if (!found) throw new Error(`theme ${theme.key} has no presets`);
  return found;
}

/** A theme's own default settings (its default preset). */
export const themeDefaults = (theme: ThemeDefinition): ThemeSettings => themePreset(theme).settings;

export interface UsableSettings {
  readonly settings: ThemeSettings;
  /** True when the stored settings couldn't be used and the theme's defaults replace them. */
  readonly fellBack: boolean;
}

/**
 * Settings as the theme should use them: stored settings from an older
 * version of the theme are migrated first, then everything is validated
 * with the theme's own schema; anything unusable becomes the theme's
 * default preset. Never throws, so a store never renders broken.
 */
export function themeSettingsFor(
  theme: ThemeDefinition,
  stored: unknown,
  storedVersion: number = theme.version,
): UsableSettings {
  let input = stored;
  if (storedVersion < theme.version && theme.migrateSettings) {
    try {
      input = theme.migrateSettings(stored, storedVersion);
    } catch {
      return { settings: themeDefaults(theme), fellBack: true };
    }
  }
  const parsed = theme.settingsSchema.safeParse(input);
  return parsed.success
    ? { settings: parsed.data, fellBack: false }
    : { settings: themeDefaults(theme), fellBack: true };
}

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

/** Every text colour the engine derives meets this against what it sits on (WCAG AA). */
export const TEXT_CONTRAST_MINIMUM = 4.5;

function readsOnAll(colour: string, backdrops: readonly string[]): boolean {
  return backdrops.every((b) => contrastRatio(colour, b) >= TEXT_CONTRAST_MINIMUM);
}

/**
 * White or near-black, whichever reads better on `background`. Near-black
 * tops out at 4.35:1 against mid tones, so pure black takes over there:
 * the result is always at least 4.5:1.
 */
function readableOn(background: string): string {
  const best = (dark: string) =>
    contrastRatio("#ffffff", background) >= contrastRatio(dark, background) ? "#ffffff" : dark;
  const soft = best("#111111");
  return contrastRatio(soft, background) >= TEXT_CONTRAST_MINIMUM ? soft : best("#000000");
}

/**
 * The tinted surface (cards, the hero, "Subtle" sections): the background
 * moved slightly towards the text, never so far that body text drops below
 * 4.5:1 on it.
 */
function surfaceFor(background: string, text: string): string {
  for (const amount of [0.04, 0.03, 0.02, 0.01]) {
    const candidate = mix(background, text, amount);
    if (readsOnAll(text, [candidate])) return candidate;
  }
  return background;
}

/**
 * The most muted mix of text into background that keeps 4.5:1 against every
 * backdrop muted text sits on (the page background and the surface). Falls
 * back to the text colour, which reads on both by construction.
 */
function mutedText(text: string, backdrops: readonly string[]): string {
  const background = backdrops[0] ?? text;
  for (let step = 16; step >= 1; step--) {
    const candidate = mix(text, background, step * 0.025);
    if (readsOnAll(candidate, backdrops)) return candidate;
  }
  return text;
}

/**
 * `base` moved towards the text colour until it reads (4.5:1) on every
 * backdrop: keeps a brand or status hue where it's readable and gives way to
 * the text colour where it isn't.
 */
function readableTone(base: string, text: string, backdrops: readonly string[]): string {
  for (let step = 0; step <= 10; step++) {
    const candidate = mix(base, text, step / 10);
    if (readsOnAll(candidate, backdrops)) return candidate;
  }
  return text;
}

// Status hues: a deep tone for light backgrounds, a light one for dark.
const STATUS_HUES = {
  success: ["#166534", "#4ade80"],
  warning: ["#92400e", "#fbbf24"],
  danger: ["#b91c1c", "#f87171"],
} as const;

function statusColour(
  status: keyof typeof STATUS_HUES,
  text: string,
  backdrops: readonly [string, ...string[]],
): string {
  const [onLight, onDark] = STATUS_HUES[status];
  const base = readableOn(backdrops[0]) === "#ffffff" ? onDark : onLight;
  return readableTone(base, text, backdrops);
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

/** The design tokens for validated settings. */
export function resolveTheme(settings: ThemeSettings): ThemeTokens {
  const { background, text, primary, accent } = settings.colors;
  const onPrimary = readableOn(primary);
  const surface = surfaceFor(background, text);
  // Text sits on both the page background and the surface.
  const backdrops = [background, surface] as const;
  const muted = mutedText(text, backdrops);
  const [sm, md, lg] = RADII[settings.radius];
  // Outline buttons show their label in the brand colour, on either backdrop.
  const outline = readableTone(primary, text, backdrops);
  const button =
    settings.buttonStyle === "outline"
      ? { background: "transparent", text: outline, border: outline }
      : { background: primary, text: onPrimary, border: primary };
  return {
    "color.primary": primary,
    "color.on-primary": onPrimary,
    "color.secondary": muted,
    "color.accent": accent,
    "color.background": background,
    "color.surface": surface,
    "color.text": text,
    "color.muted": muted,
    "color.border": mix(background, text, 0.14),
    "color.success": statusColour("success", text, backdrops),
    "color.warning": statusColour("warning", text, backdrops),
    "color.danger": statusColour("danger", text, backdrops),
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

/** The `:root` block of custom properties for tokens (only names in `known`). */
export function tokensCss(tokens: ThemeTokens, known: ReadonlySet<string>): string {
  const declarations = Object.entries(tokens)
    .filter(([name, value]) => known.has(name) && SAFE_VALUE.test(value))
    .map(([name, value]) => `${tokenVariable(name)}:${value}`)
    .join(";");
  return `:root{${declarations}}`;
}
