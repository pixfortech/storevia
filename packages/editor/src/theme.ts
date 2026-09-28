// Design tokens belong to the Site Engine (ADR-0029: branding); re-exported
// here so the page-document code keeps one import path.
import { THEME_ENGINE_VERSION, type ThemePlatform } from "@storevia/site-engine/theme";
import { DOCUMENT_SCHEMA_VERSION } from "./document/types";

export * from "@storevia/site-engine/theme";

/**
 * What a theme must support to be installed, published or rendered here
 * (ThemeDefinition.compatibility): this theme engine and the page-document
 * schema this editor writes.
 */
export const THEME_PLATFORM: ThemePlatform = {
  engine: THEME_ENGINE_VERSION,
  documentSchema: DOCUMENT_SCHEMA_VERSION,
};
