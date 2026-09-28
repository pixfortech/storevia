// Theme compatibility is checked against the page-document schema this
// editor writes (08-themes.md §10): raising DOCUMENT_SCHEMA_VERSION without
// declaring support in every first-party theme fails here, before any store
// could render an incompatible theme.
import { describe, expect, it } from "vitest";
import { DOCUMENT_SCHEMA_VERSION } from "./document";
import { THEMES, THEME_ENGINE_VERSION, THEME_PLATFORM, themeCompatibilityIssue } from "./theme";

describe("theme platform", () => {
  it("is this editor's document schema and the Site Engine's theme contract", () => {
    expect(THEME_PLATFORM).toEqual({
      engine: THEME_ENGINE_VERSION,
      documentSchema: DOCUMENT_SCHEMA_VERSION,
    });
  });

  it("every first-party theme supports it", () => {
    for (const theme of Object.values(THEMES)) {
      expect(themeCompatibilityIssue(theme, THEME_PLATFORM), theme.key).toBeNull();
    }
  });
});
