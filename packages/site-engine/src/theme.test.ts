// The theme engine (ADR-0030 §7): bounded, validated settings with
// contrast rules, resolved to design tokens and CSS custom properties.
import { describe, expect, it } from "vitest";
import {
  BOUTIQUE_THEME,
  DEFAULT_THEME,
  DEFAULT_THEME_DEFINITION,
  DEFAULT_THEME_SETTINGS,
  FONT_STACKS,
  STOREVIA_THEME,
  THEMES,
  THEME_ENGINE_VERSION,
  TOKEN_NAMES,
  contrastRatio,
  defineTheme,
  renderableTheme,
  resolveTheme,
  themeCompatibilityIssue,
  themeCss,
  themeDefaults,
  themeDefinition,
  themeDefinitionProblems,
  themeSettingsFor,
  themeSettingsSchema,
  themeSettingsSchemaFor,
  usableThemeSettings,
  type ThemeDefinition,
  type ThemeSettings,
} from "./theme";

const withColors = (colors: Partial<ThemeSettings["colors"]>): unknown => ({
  ...DEFAULT_THEME_SETTINGS,
  colors: { ...DEFAULT_THEME_SETTINGS.colors, ...colors },
});

describe("theme engine", () => {
  it("every preset is valid and resolves to the full token set", () => {
    for (const preset of STOREVIA_THEME.presets) {
      expect(themeSettingsSchema.safeParse(preset.settings).success, preset.key).toBe(true);
      expect(Object.keys(resolveTheme(preset.settings)).sort()).toEqual([...TOKEN_NAMES].sort());
    }
    expect(STOREVIA_THEME.presets.map((p) => p.key)).toEqual(["editorial", "minimal", "modern"]);
  });

  it("the default keeps the M4 look (serif headings, stone palette)", () => {
    expect(DEFAULT_THEME["color.primary"]).toBe("#1c1917");
    expect(DEFAULT_THEME["color.accent"]).toBe("#9a3412");
    expect(DEFAULT_THEME["font.heading"]).toBe(FONT_STACKS["system-serif"].stack);
    expect(DEFAULT_THEME["container.width"]).toBe("72rem");
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("nonsense", "#ffffff")).toBe(1);
  });

  it.each([
    ["text too close to the background", withColors({ text: "#999999" }), "text"],
    ["a brand colour that disappears", withColors({ primary: "#f5f5f5" }), "primary"],
    ["an invisible focus accent", withColors({ accent: "#fefefe" }), "accent"],
  ])("refuses %s", (_label, input, field) => {
    const result = themeSettingsSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toContain(`colors.${field}`);
  });

  it("outline buttons need text-level contrast for the brand colour", () => {
    const mid = {
      ...DEFAULT_THEME_SETTINGS,
      colors: { ...DEFAULT_THEME_SETTINGS.colors, primary: "#8a8a8a" },
    };
    expect(themeSettingsSchema.safeParse({ ...mid, buttonStyle: "solid" }).success).toBe(true);
    expect(themeSettingsSchema.safeParse({ ...mid, buttonStyle: "outline" }).success).toBe(false);
  });

  it.each([
    ["CSS in a colour", withColors({ primary: "red;}body{display:none" })],
    ["a named colour", withColors({ primary: "red" })],
    ["short hex", withColors({ primary: "#fff" })],
    ["an unknown font", { ...DEFAULT_THEME_SETTINGS, headingFont: "Comic Sans" }],
    ["a font stack", { ...DEFAULT_THEME_SETTINGS, bodyFont: "x;}</style><script>" }],
    ["an unknown radius", { ...DEFAULT_THEME_SETTINGS, radius: "huge" }],
    ["extra keys", { ...DEFAULT_THEME_SETTINGS, css: "body{}" }],
    ["a missing field", { ...DEFAULT_THEME_SETTINGS, colors: { background: "#ffffff" } }],
  ])("refuses %s", (_label, input) => {
    expect(themeSettingsSchema.safeParse(input).success).toBe(false);
  });

  it("normalises colour case and keeps unusable stored settings off the site", () => {
    const parsed = themeSettingsSchema.parse(withColors({ accent: "#2563EB" }));
    expect(parsed.colors.accent).toBe("#2563eb");
    expect(usableThemeSettings({ junk: true })).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("derives readable colours: text on the brand colour always reaches 4.5:1", () => {
    for (const primary of ["#ffd400", "#1d4ed8", "#16a34a", "#dc2626", "#000000", "#ffffff"]) {
      const tokens = resolveTheme({
        ...DEFAULT_THEME_SETTINGS,
        colors: { background: "#ffffff", text: "#111111", primary, accent: "#1d4ed8" },
      });
      expect(contrastRatio(tokens["color.on-primary"] ?? "", primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens["color.muted"] ?? "", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("maps named options to bounded values", () => {
    const tokens = resolveTheme({
      ...DEFAULT_THEME_SETTINGS,
      buttonStyle: "pill",
      radius: "none",
      contentWidth: "wide",
      sectionSpacing: "compact",
    });
    expect(tokens["radius.button"]).toBe("999px");
    expect(tokens["radius.md"]).toBe("0");
    expect(tokens["container.width"]).toBe("84rem");
    expect(tokens["space.section"]).toBe("2.5rem");
    const outline = resolveTheme({ ...DEFAULT_THEME_SETTINGS, buttonStyle: "outline" });
    expect(outline["button.background"]).toBe("transparent");
  });

  it("CSS output carries only known tokens with safe values", () => {
    const css = themeCss(
      resolveTheme(STOREVIA_THEME.presets[2]?.settings ?? DEFAULT_THEME_SETTINGS),
    );
    expect(css).toMatch(/^:root\{--sv-color-primary:#4338ca;/);
    expect(css).toContain("--sv-radius-button:999px");
    expect(
      themeCss({ ...DEFAULT_THEME, "evil.token": "x", "color.text": "x;}</style>" }),
    ).not.toMatch(/evil|<\/style>/);
  });
});

// ---------------------------------------------------------------------------
// M7: theme packages (08-themes.md §10).
// ---------------------------------------------------------------------------

/** The page-document schema this platform writes (@storevia/editor DOCUMENT_SCHEMA_VERSION). */
const PLATFORM = { engine: THEME_ENGINE_VERSION, documentSchema: 1 };

/** Every selector of a stylesheet, outside and inside @media blocks. */
function selectors(css: string): string[] {
  const out: string[] = [];
  const body = css.replace(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)\}/g, (_m, inner: string) => {
    out.push(...selectors(inner));
    return "";
  });
  for (const [, list] of body.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    out.push(...(list ?? "").split(",").map((s) => s.trim()));
  }
  return out;
}

const minimalTheme = (overrides: Partial<ThemeDefinition> = {}): ThemeDefinition => ({
  key: "test-theme",
  version: 1,
  name: "Test",
  description: "A theme for tests.",
  author: "Storevia",
  compatibility: { engine: [THEME_ENGINE_VERSION], documentSchema: [1] },
  presets: [
    {
      key: "plain",
      name: "Plain",
      description: "Plain.",
      settings: { ...DEFAULT_THEME_SETTINGS, preset: "plain" },
    },
  ],
  defaultPreset: "plain",
  settingsSchema: themeSettingsSchemaFor(["plain"]),
  chrome: STOREVIA_THEME.chrome,
  stylesheet: "",
  ...overrides,
});

describe("theme package contract", () => {
  it("every first-party theme keeps the contract and supports this platform", () => {
    expect(Object.keys(THEMES)).toEqual(["storevia", "boutique"]);
    expect(DEFAULT_THEME_DEFINITION).toBe(STOREVIA_THEME);
    for (const [key, theme] of Object.entries(THEMES)) {
      expect(theme.key).toBe(key);
      expect(themeDefinitionProblems(theme), key).toEqual([]);
      expect(theme.author).toBe("Storevia");
      expect(Number.isInteger(theme.version) && theme.version >= 1).toBe(true);
      expect(theme.description.length).toBeGreaterThan(20);
      expect(themeCompatibilityIssue(theme, PLATFORM), key).toBeNull();
    }
  });

  it("refuses broken definitions when they are declared", () => {
    expect(() => defineTheme(minimalTheme())).not.toThrow();
    const broken: [string, Partial<ThemeDefinition>][] = [
      ["a bad key", { key: "Bad Key" }],
      ["a zero version", { version: 0 }],
      ["a third-party author", { author: "Someone" as "Storevia" }],
      ["no compatibility", { compatibility: { engine: [], documentSchema: [1] } }],
      ["a missing default preset", { defaultPreset: "other" }],
      ["an imported stylesheet", { stylesheet: '@import "https://evil.example/x.css";' }],
      ["a stylesheet loading URLs", { stylesheet: "a{background:url(https://x.example/t.png)}" }],
      ["markup in a stylesheet", { stylesheet: "</style><script>alert(1)</script>" }],
      [
        "a preset failing the contrast rules",
        {
          presets: [
            {
              key: "plain",
              name: "Plain",
              description: "Plain.",
              settings: {
                ...DEFAULT_THEME_SETTINGS,
                preset: "plain",
                colors: { ...DEFAULT_THEME_SETTINGS.colors, text: "#eeeeee" },
              },
            },
          ],
        },
      ],
    ];
    for (const [label, overrides] of broken) {
      expect(() => defineTheme(minimalTheme(overrides)), label).toThrow(/^theme /);
    }
  });

  it("Boutique is a genuinely different presentation, delivered by chrome and scoped first-party CSS", () => {
    const [storevia, boutique] = [STOREVIA_THEME.chrome, BOUTIQUE_THEME.chrome];
    expect(boutique.header).toBe("centred");
    expect(boutique.navigation).toBe("uppercase");
    for (const slot of ["header", "navigation", "footer", "productCard", "productPage"] as const) {
      expect(boutique[slot], slot).not.toBe(storevia[slot]);
    }
    expect(STOREVIA_THEME.stylesheet).toBe("");
    const rules = selectors(BOUTIQUE_THEME.stylesheet);
    expect(rules.length).toBeGreaterThan(20);
    for (const selector of rules) {
      expect(selector.startsWith('[data-sv-theme="boutique"] '), selector).toBe(true);
    }
    // Product cards, the product page, buttons, menus and checkout all get its treatment.
    for (const cls of [
      ".sv-card-media",
      ".sv-product",
      ".sv-button",
      ".sv-brand",
      ".sv-checkout",
    ]) {
      expect(BOUTIQUE_THEME.stylesheet, cls).toContain(cls);
    }
    // The single-column product page on phones survives its desktop layout.
    expect(BOUTIQUE_THEME.stylesheet).toMatch(
      /@media \(max-width:640px\)\{[^}]*\.sv-product\{grid-template-columns:minmax\(0,1fr\)/,
    );
  });

  it("each theme accepts only its own presets", () => {
    const boutique = themeDefaults(BOUTIQUE_THEME);
    expect(boutique.preset).toBe("atelier");
    expect(STOREVIA_THEME.settingsSchema.safeParse(boutique).success).toBe(false);
    expect(BOUTIQUE_THEME.settingsSchema.safeParse(DEFAULT_THEME_SETTINGS).success).toBe(false);
    expect(BOUTIQUE_THEME.settingsSchema.safeParse({ ...boutique, css: "x" }).success).toBe(false);
    expect(themeSettingsSchema).toBe(STOREVIA_THEME.settingsSchema);
  });

  it.each(BOUTIQUE_THEME.presets.map((p) => [p.key, p.settings] as const))(
    "Boutique's %s preset passes the contrast rules and resolves every token",
    (_key, settings) => {
      expect(BOUTIQUE_THEME.settingsSchema.safeParse(settings).success).toBe(true);
      const { background, text, primary, accent } = settings.colors;
      expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(primary, background)).toBeGreaterThanOrEqual(
        settings.buttonStyle === "outline" ? 4.5 : 3,
      );
      expect(contrastRatio(accent, background)).toBeGreaterThanOrEqual(3);
      const tokens = resolveTheme(settings);
      expect(Object.keys(tokens).sort()).toEqual([...TOKEN_NAMES].sort());
      expect(contrastRatio(tokens["color.on-primary"] ?? "", primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens["color.muted"] ?? "", background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens["color.danger"] ?? "", background)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("theme compatibility", () => {
  it("is refused when the engine or the page-document schema isn't supported", () => {
    const future = minimalTheme({ compatibility: { engine: [2], documentSchema: [1] } });
    const oldDocs = minimalTheme({ compatibility: { engine: [1], documentSchema: [0] } });
    expect(themeCompatibilityIssue(minimalTheme(), PLATFORM)).toBeNull();
    expect(themeCompatibilityIssue(future, PLATFORM)).toMatch(/theme engine/);
    expect(themeCompatibilityIssue(oldDocs, PLATFORM)).toMatch(/pages/);
    // A platform that moved on (document schema 2) no longer accepts today's themes.
    for (const theme of Object.values(THEMES)) {
      expect(themeCompatibilityIssue(theme, { ...PLATFORM, documentSchema: 2 })).not.toBeNull();
    }
  });
});

describe("stored settings across theme versions", () => {
  // Version 2 renamed "brand" to colors.primary; version 1 settings are migrated on read.
  const v2 = minimalTheme({
    version: 2,
    migrateSettings: (settings, fromVersion) => {
      if (fromVersion >= 2 || typeof settings !== "object" || settings === null) return settings;
      const { brand, ...rest } = settings as { brand?: string; colors?: object };
      return { ...rest, colors: { ...rest.colors, primary: brand } };
    },
  });
  const v1Settings = {
    ...DEFAULT_THEME_SETTINGS,
    preset: "plain",
    brand: "#4338ca",
    colors: { background: "#ffffff", text: "#111111", accent: "#1d4ed8" },
  };

  it("migrates older settings, then validates them", () => {
    const result = themeSettingsFor(v2, v1Settings, 1);
    expect(result.fellBack).toBe(false);
    expect(result.settings.colors.primary).toBe("#4338ca");
    // Without the migration the old shape doesn't validate: the theme's defaults are used.
    expect(themeSettingsFor(minimalTheme({ version: 2 }), v1Settings, 1)).toEqual({
      settings: themeDefaults(v2),
      fellBack: true,
    });
  });

  it("falls back to the theme's defaults, never throws, for anything unusable", () => {
    const throwing = minimalTheme({
      version: 3,
      migrateSettings: () => {
        throw new Error("boom");
      },
    });
    expect(themeSettingsFor(throwing, v1Settings, 1)).toEqual({
      settings: themeDefaults(throwing),
      fellBack: true,
    });
    expect(themeSettingsFor(v2, { junk: true }, 2).fellBack).toBe(true);
    expect(usableThemeSettings(themeDefaults(BOUTIQUE_THEME), BOUTIQUE_THEME)).toEqual(
      themeDefaults(BOUTIQUE_THEME),
    );
  });
});

describe("rendering a stored theme", () => {
  const boutiqueLinen = BOUTIQUE_THEME.presets.find((p) => p.key === "linen")?.settings;

  it("uses the stored theme package and its settings", () => {
    const rendered = renderableTheme(
      { themeKey: "boutique", themeVersion: 1, settings: boutiqueLinen },
      PLATFORM,
    );
    expect(rendered.theme).toBe(BOUTIQUE_THEME);
    expect(rendered.fallback).toBeNull();
    expect(rendered.tokens["color.primary"]).toBe("#6b2f3a");
    expect(renderableTheme(null, PLATFORM)).toMatchObject({
      theme: STOREVIA_THEME,
      settings: DEFAULT_THEME_SETTINGS,
      fallback: null,
    });
  });

  it("falls back safely: unknown or removed themes, incompatible themes and invalid settings", () => {
    const unknown = renderableTheme(
      { themeKey: "retired", themeVersion: 1, settings: boutiqueLinen },
      PLATFORM,
    );
    expect(unknown).toMatchObject({
      theme: STOREVIA_THEME,
      settings: DEFAULT_THEME_SETTINGS,
      fallback: "unknown-theme",
    });
    const incompatible = renderableTheme(
      { themeKey: "boutique", themeVersion: 1, settings: boutiqueLinen },
      { ...PLATFORM, documentSchema: 2 },
    );
    expect(incompatible).toMatchObject({ theme: STOREVIA_THEME, fallback: "incompatible" });
    const invalid = renderableTheme(
      { themeKey: "boutique", themeVersion: 1, settings: DEFAULT_THEME_SETTINGS },
      PLATFORM,
    );
    expect(invalid).toMatchObject({
      theme: BOUTIQUE_THEME,
      settings: themeDefaults(BOUTIQUE_THEME),
      fallback: "invalid-settings",
    });
  });

  it("never resolves inherited object keys as themes", () => {
    for (const key of ["__proto__", "toString", "constructor", "hasOwnProperty"]) {
      expect(themeDefinition(key), key).toBeNull();
    }
    expect(themeDefinition(undefined)).toBeNull();
    expect(themeDefinition("boutique")).toBe(BOUTIQUE_THEME);
  });
});
