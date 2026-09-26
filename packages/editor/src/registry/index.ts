import { button, divider, hero, heading, image, richText, spacer, text } from "./components/basic";
import {
  collectionHeader,
  collectionProducts,
  productDetail,
  productGrid,
  searchResults,
} from "./components/commerce";
import { column, columns, container, section } from "./components/layout";
import type { ComponentDefinition, Registry } from "./types";

export * from "./types";
export { defineComponent } from "./define";

export function createRegistry(definitions: readonly ComponentDefinition[]): Registry {
  const byType = new Map<string, ComponentDefinition>();
  for (const definition of definitions) {
    if (byType.has(definition.type))
      throw new Error(`component "${definition.type}" is registered twice`);
    byType.set(definition.type, definition);
  }
  return {
    get: (type) => byType.get(type),
    types: [...byType.keys()],
  };
}

/** The M4 base set (ADR-0028 §5); M5 registers the rest of 07 §5. */
export const BASE_COMPONENTS: readonly ComponentDefinition[] = [
  section,
  container,
  columns,
  column,
  heading,
  text,
  richText,
  image,
  button,
  divider,
  spacer,
  hero,
  productGrid,
  productDetail,
  collectionHeader,
  collectionProducts,
  searchResults,
];

export const DEFAULT_REGISTRY: Registry = createRegistry(BASE_COMPONENTS);
