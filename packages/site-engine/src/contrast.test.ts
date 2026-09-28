// Contrast regression (M8): every text colour the theme engine derives reads
// at WCAG AA (4.5:1) on every backdrop it's used on, for every first-party
// preset and for any merchant colour combination the settings schema
// accepts. The storefront's stylesheets are checked against these tokens in
// apps/storefront/src/lib/contrast.test.ts.
import { describe, expect, it } from "vitest";
import {
  THEMES,
  contrastRatio,
  resolveTheme,
  type ThemeDefinition,
  type ThemeSettings,
} from "./theme";

const AA = 4.5;

/** Every (foreground, background) token pair the storefront renders text with. */
function textPairs(settings: ThemeSettings): { name: string; fg: string; bg: string }[] {
  const t = resolveTheme(settings);
  const token = (name: string) => t[name] ?? "";
  const backdrops = ["color.background", "color.surface"];
  const onBackdrops = [
    "color.text",
    "color.muted",
    "color.secondary",
    "color.success",
    "color.warning",
    "color.danger",
  ];
  const pairs = backdrops.flatMap((bg) =>
    onBackdrops.map((fg) => ({ name: `${fg} on ${bg}`, fg: token(fg), bg: token(bg) })),
  );
  // The label of the theme's button, on its fill or (outline) on either backdrop.
  const buttonBackdrops = settings.buttonStyle === "outline" ? backdrops : ["button.background"];
  for (const bg of buttonBackdrops) {
    pairs.push({ name: `button.text on ${bg}`, fg: token("button.text"), bg: token(bg) });
  }
  // Brand-colour sections, the announcement bar and the skip link.
  pairs.push({
    name: "color.on-primary on color.primary",
    fg: token("color.on-primary"),
    bg: token("color.primary"),
  });
  return pairs;
}

function failures(settings: ThemeSettings): string[] {
  return textPairs(settings)
    .map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
    .filter((p) => p.ratio < AA)
    .map((p) => `${p.name}: ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}`);
}

const PRESETS = Object.values(THEMES).flatMap((theme: ThemeDefinition) =>
  theme.presets.flatMap((preset) =>
    (["solid", "outline", "pill"] as const).map(
      (buttonStyle) =>
        [
          `${theme.key}/${preset.key}/${buttonStyle}`,
          theme,
          { ...preset.settings, buttonStyle },
        ] as const,
    ),
  ),
);

describe("first-party presets", () => {
  it("covers both first-party themes", () => {
    expect(new Set(PRESETS.map(([, theme]) => theme.key))).toEqual(
      new Set(["storevia", "boutique"]),
    );
  });

  it.each(PRESETS)("%s: every text/background pair reaches 4.5:1", (_name, theme, settings) => {
    // A button style the schema refuses for this preset never reaches a site.
    if (!theme.settingsSchema.safeParse(settings).success) return;
    expect(failures(settings)).toEqual([]);
  });

  it.each(PRESETS.filter(([, , s]) => s.buttonStyle !== "outline"))(
    "%s: the as-shipped preset keeps the muted colour visibly muted",
    (_name, _theme, settings) => {
      const t = resolveTheme(settings);
      // Guarding against a "fix" that just returns the text colour.
      expect(t["color.muted"]).not.toBe(settings.colors.text);
    },
  );
});

// A deterministic grid of merchant colours: light, tinted and dark
// backgrounds; near-black, coloured and light text; saturated, pale and dark
// brand colours. Only combinations the schema accepts are checked, as only
// those can be saved.
const BACKGROUNDS = [
  "#ffffff",
  "#fafaf9",
  "#f5f0e6",
  "#fff7ed",
  "#eef2ff",
  "#e5e7eb",
  "#111827",
  "#1c1917",
  "#0b1020",
  "#3f3f46",
];
const TEXTS = [
  "#111111",
  "#1f2937",
  "#3b3b3b",
  "#57534e",
  "#1e3a8a",
  "#f9fafb",
  "#e7e5e4",
  "#d4d4d8",
];
const PRIMARIES = [
  "#1d4ed8",
  "#16a34a",
  "#dc2626",
  "#ffd400",
  "#7c3aed",
  "#0f766e",
  "#6b7280",
  "#8b5a2b",
  "#f472b6",
  "#000000",
  "#ffffff",
  "#5b6b7b",
];
const ACCENTS = ["#2563eb", "#f59e0b", "#e11d48", "#fde047"];

describe("any accepted merchant colours", () => {
  const schema = THEMES["storevia"]?.settingsSchema;
  const base = THEMES["storevia"]?.presets[0]?.settings;
  if (!schema || !base) throw new Error("storevia theme missing");
  const accepted: ThemeSettings[] = [];
  for (const background of BACKGROUNDS)
    for (const text of TEXTS)
      for (const primary of PRIMARIES)
        for (const accent of ACCENTS)
          for (const buttonStyle of ["solid", "outline"] as const) {
            const candidate = {
              ...base,
              buttonStyle,
              colors: { background, text, primary, accent },
            };
            const parsed = schema.safeParse(candidate);
            if (parsed.success) accepted.push(parsed.data);
          }

  it("the grid exercises light and dark themes, both button styles", () => {
    expect(accepted.length).toBeGreaterThan(300);
    expect(accepted.some((s) => s.colors.background === "#111827")).toBe(true);
    expect(accepted.some((s) => s.buttonStyle === "outline")).toBe(true);
  });

  it("every accepted combination derives readable tokens", () => {
    const broken = accepted.flatMap((s) =>
      failures(s).map((f) => `${JSON.stringify(s.colors)} ${s.buttonStyle}: ${f}`),
    );
    expect(broken).toEqual([]);
  });

  it("text on a mid-tone brand colour still reaches 4.5:1 (near-black stops at 4.35:1)", () => {
    for (const primary of ["#5b6b7b", "#6b7280", "#7a7a7a", "#808080", "#8a8a8a"]) {
      const t = resolveTheme({ ...base, colors: { ...base.colors, primary } });
      expect(contrastRatio(t["color.on-primary"] ?? "", primary)).toBeGreaterThanOrEqual(AA);
    }
  });
});
