import type { ComponentDefinition } from "./types";

/** Keeps each definition's props type while storing them in one registry. */
export function defineComponent<P extends object>(
  definition: ComponentDefinition<P>,
): ComponentDefinition {
  return definition as unknown as ComponentDefinition;
}

/** Joins class names, skipping empty ones. */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ");
