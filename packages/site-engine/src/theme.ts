// The first-party theme registry (docs/architecture/08-themes.md §10,
// ADR-0030 §7): the theme packages Storevia ships, how a stored theme is
// turned into what a page renders, and the defaults. Themes are trusted
// first-party code reviewed with the rest of this repository; there is no
// way to install merchant- or third-party-supplied theme code. Pure and
// client-safe (the dashboard's customiser uses the same definitions).
import {
  resolveTheme,
  themeCompatibilityIssue,
  themeDefaults,
  themeSettingsFor,
  themeSettingsShapeFor,
  tokensCss,
  type ThemeDefinition,
  type ThemePlatform,
  type ThemeSettings,
  type ThemeTokens,
} from "./theme-core";
import { BOUTIQUE_THEME } from "./themes/boutique";
import { STOREVIA_PRESET_KEYS, STOREVIA_THEME } from "./themes/storevia";

export * from "./theme-core";
export { STOREVIA_THEME, STOREVIA_PRESET_KEYS } from "./themes/storevia";
export { BOUTIQUE_THEME, BOUTIQUE_PRESET_KEYS } from "./themes/boutique";

export type ThemeCatalogue = Readonly<Record<string, ThemeDefinition>>;

/** Every theme a store can install, by key. The first is the default. */
export const THEMES: ThemeCatalogue = Object.freeze({
  storevia: STOREVIA_THEME,
  boutique: BOUTIQUE_THEME,
});

/** The theme every store starts with, and what an unknown or unusable theme falls back to. */
export const DEFAULT_THEME_DEFINITION: ThemeDefinition = STOREVIA_THEME;

/** The definition for a stored theme key, or null when no such theme ships (removed or never existed). */
export function themeDefinition(
  key: string | null | undefined,
  catalogue: ThemeCatalogue = THEMES,
): ThemeDefinition | null {
  if (typeof key !== "string" || !Object.hasOwn(catalogue, key)) return null;
  return catalogue[key] ?? null;
}

// ---------------------------------------------------------------------------
// The default theme's settings (the pre-M7 names stay for existing callers).
// ---------------------------------------------------------------------------

export const THEME_PRESET_KEYS = STOREVIA_PRESET_KEYS;
export const themeSettingsShape = themeSettingsShapeFor(STOREVIA_PRESET_KEYS);
/** The default theme's settings schema; other themes have their own (`ThemeDefinition.settingsSchema`). */
export const themeSettingsSchema = STOREVIA_THEME.settingsSchema;
export const DEFAULT_THEME_SETTINGS: ThemeSettings = themeDefaults(STOREVIA_THEME);

/** Settings as `theme` should use them: valid ones (migrated from older versions) as they are, anything else as its default preset. */
export function usableThemeSettings(
  input: unknown,
  theme: ThemeDefinition = DEFAULT_THEME_DEFINITION,
  storedVersion?: number,
): ThemeSettings {
  return themeSettingsFor(theme, input, storedVersion).settings;
}

/** The tokens every site renders with until its theme is customised. */
export const DEFAULT_THEME: ThemeTokens = resolveTheme(DEFAULT_THEME_SETTINGS);

export const TOKEN_NAMES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_THEME));

/** The `:root` block of custom properties for a theme. */
export function themeCss(tokens: ThemeTokens = DEFAULT_THEME): string {
  return tokensCss(tokens, TOKEN_NAMES);
}

// ---------------------------------------------------------------------------
// Rendering a stored theme.
// ---------------------------------------------------------------------------

/** A store's theme as read from the database (settings unvalidated). */
export interface StoredTheme {
  readonly themeKey: string;
  /** The theme version the settings were saved for. */
  readonly themeVersion: number;
  readonly settings: unknown;
}

export type ThemeFallback = "unknown-theme" | "incompatible" | "invalid-settings";

export interface RenderedTheme {
  readonly theme: ThemeDefinition;
  readonly settings: ThemeSettings;
  readonly tokens: ThemeTokens;
  /** Why the stored theme or settings weren't used as they are (null when they were). */
  readonly fallback: ThemeFallback | null;
}

/**
 * What a page renders for a store's stored theme. Never broken: a theme key
 * that no longer ships, or a theme incompatible with this platform, renders
 * the default theme (keeping the stored settings only if they are valid for
 * it); settings that don't validate for their theme become its defaults.
 */
export function renderableTheme(
  stored: StoredTheme | null,
  platform: ThemePlatform,
  catalogue: ThemeCatalogue = THEMES,
): RenderedTheme {
  const rendered = (
    theme: ThemeDefinition,
    settings: ThemeSettings,
    fallback: ThemeFallback | null,
  ): RenderedTheme => ({ theme, settings, tokens: resolveTheme(settings), fallback });
  if (!stored) return rendered(DEFAULT_THEME_DEFINITION, DEFAULT_THEME_SETTINGS, null);
  const theme = themeDefinition(stored.themeKey, catalogue);
  const usable = theme && themeCompatibilityIssue(theme, platform) === null ? theme : null;
  if (!usable) {
    const { settings } = themeSettingsFor(DEFAULT_THEME_DEFINITION, stored.settings);
    return rendered(DEFAULT_THEME_DEFINITION, settings, theme ? "incompatible" : "unknown-theme");
  }
  const { settings, fellBack } = themeSettingsFor(usable, stored.settings, stored.themeVersion);
  return rendered(usable, settings, fellBack ? "invalid-settings" : null);
}
