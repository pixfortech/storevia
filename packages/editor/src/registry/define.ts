import type { ComponentDefinition, SiteRenderContext } from "./types";

/** Keeps each definition's props type while storing them in one registry. */
export function defineComponent<P extends object, C extends SiteRenderContext = SiteRenderContext>(
  definition: ComponentDefinition<P, C>,
): ComponentDefinition<object, C> {
  return definition as unknown as ComponentDefinition<object, C>;
}

/** Joins class names, skipping empty ones. */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ");
