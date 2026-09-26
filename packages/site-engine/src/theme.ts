// Design tokens (docs/architecture/08-themes.md §7) and the built-in theme
// every store renders with until themes arrive (ADR-0028 §6). Tokens become
// CSS custom properties on :root (`color.primary` → `--sv-color-primary`);
// node styles that reference a token compile to `var(--sv-…)`, so a token
// change restyles every page. Pure and client-safe.

export type ThemeTokens = Readonly<Record<string, string>>;

/** System font stacks: no font downloads, no third-party requests. */
const SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const DEFAULT_THEME: ThemeTokens = {
  "color.primary": "#1c1917",
  "color.on-primary": "#ffffff",
  "color.secondary": "#57534e",
  "color.accent": "#9a3412",
  "color.background": "#ffffff",
  "color.surface": "#f5f5f4",
  "color.text": "#1c1917",
  "color.muted": "#5e5a55",
  "color.border": "#e7e5e4",
  "color.success": "#166534",
  "color.warning": "#92400e",
  "color.danger": "#b91c1c",
  "font.heading": SERIF,
  "font.body": SANS,
  "font.mono": MONO,
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
  "radius.sm": "4px",
  "radius.md": "8px",
  "radius.lg": "12px",
  "radius.full": "999px",
  "shadow.sm": "0 1px 2px rgb(0 0 0 / 0.06)",
  "shadow.md": "0 4px 12px rgb(0 0 0 / 0.08)",
  "container.width": "72rem",
};

export const TOKEN_NAMES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_THEME));

/** Token namespaces a style property may reference. */
export function tokenNamespace(token: string): string {
  return token.slice(0, token.indexOf("."));
}

/** `color.primary` → `--sv-color-primary`. Token names are validated first. */
export function tokenVariable(token: string): string {
  return `--sv-${token.replace(".", "-")}`;
}

// Theme values are Storevia's own in M4; themes (M7) validate their values
// against these same shapes before they reach CSS.
const SAFE_VALUE = /^[A-Za-z0-9#.,%()/\s"'-]+$/;

/** The `:root` block of custom properties for a theme. */
export function themeCss(tokens: ThemeTokens = DEFAULT_THEME): string {
  const declarations = Object.entries(tokens)
    .filter(([name, value]) => TOKEN_NAMES.has(name) && SAFE_VALUE.test(value))
    .map(([name, value]) => `${tokenVariable(name)}:${value}`)
    .join(";");
  return `:root{${declarations}}`;
}
