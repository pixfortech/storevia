// Registries (ADR-0030 §3): built at compile time from link kinds and
// component definitions. `SITE_REGISTRY` is the Site Engine's own, with no
// commerce component or link kind; a composition builds its registry from
// `SITE_LINK_KINDS` and `SITE_COMPONENTS` plus its own.
import { linkSchemaFor, SITE_LINK_KINDS, type LinkKindDefinition } from "../document/refs";
import { button, divider, heading, image, richText, spacer, text } from "./components/basic";
import { column, columns, container, section } from "./components/layout";
import { SECTION_BLOCKS } from "./components/sections";
import type {
  ComponentDefinition,
  ComponentFactory,
  Registry,
  SchemaKit,
  SiteRenderContext,
} from "./types";

export * from "./types";
export { cx, defineComponent } from "./define";
export {
  SECTION_BACKGROUNDS,
  SECTION_SPACINGS,
  SectionFrame,
  sectionPresentation,
  sectionPresentationControls,
} from "./components/sections";

export interface RegistryInput<C extends SiteRenderContext> {
  readonly linkKinds: readonly LinkKindDefinition[];
  readonly components: readonly (ComponentDefinition<object, C> | ComponentFactory<C>)[];
}

export function createRegistry<C extends SiteRenderContext = SiteRenderContext>(
  input: RegistryInput<C>,
): Registry<C> {
  const kinds = new Map<string, LinkKindDefinition>();
  for (const kind of input.linkKinds) {
    if (kinds.has(kind.type)) throw new Error(`link kind "${kind.type}" is registered twice`);
    kinds.set(kind.type, kind);
  }
  const linkSchema = linkSchemaFor([...kinds.values()]);
  const kit: SchemaKit = { link: linkSchema };
  const byType = new Map<string, ComponentDefinition<object, C>>();
  for (const entry of input.components) {
    const definition = typeof entry === "function" ? entry(kit) : entry;
    if (byType.has(definition.type))
      throw new Error(`component "${definition.type}" is registered twice`);
    byType.set(definition.type, definition);
  }
  const all = [...byType.values()];
  return {
    get: (type) => byType.get(type),
    types: [...byType.keys()],
    sections: all.filter((d) => d.section === true),
    linkKinds: [...kinds.values()],
    linkSchema,
  };
}

/** The Site Engine's components: layout, basic elements and section blocks. */
export const SITE_COMPONENTS: readonly (ComponentDefinition<object> | ComponentFactory)[] = [
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
  ...SECTION_BLOCKS,
];

export { SITE_LINK_KINDS };

/** A site with no composition: generic content only. */
export const SITE_REGISTRY: Registry = createRegistry({
  linkKinds: SITE_LINK_KINDS,
  components: SITE_COMPONENTS,
});
