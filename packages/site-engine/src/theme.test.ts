// The theme engine (ADR-0030 §7): bounded, validated settings with
// contrast rules, resolved to design tokens and CSS custom properties.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  DEFAULT_THEME_SETTINGS,
  FONT_STACKS,
  STOREVIA_THEME,
  TOKEN_NAMES,
  contrastRatio,
  resolveTheme,
  themeCss,
  themeSettingsSchema,
  usableThemeSettings,
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
