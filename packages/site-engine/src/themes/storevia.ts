// Storevia: the default first-party theme (M5), now a package with a
// version, compatibility and chrome metadata (M7). Its look is the one every
// store had before themes could be switched, so it needs no stylesheet of
// its own: the shared block styles are its presentation.
import { THEME_ENGINE_VERSION, defineTheme, themeSettingsSchemaFor } from "../theme-core";

export const STOREVIA_PRESET_KEYS = ["editorial", "minimal", "modern"] as const;

export const STOREVIA_THEME = defineTheme({
  key: "storevia",
  version: 1,
  name: "Storevia",
  description:
    "The classic Storevia layout: your name and menu on one row, square product cards and a two-column product page.",
  author: "Storevia",
  compatibility: { engine: [THEME_ENGINE_VERSION], documentSchema: [1] },
  defaultPreset: "editorial",
  settingsSchema: themeSettingsSchemaFor(STOREVIA_PRESET_KEYS),
  chrome: {
    header: "inline",
    navigation: "plain",
    footer: "inline",
    productCard: "square",
    productPage: "split",
  },
  stylesheet: "",
  presets: [
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
  ],
});
