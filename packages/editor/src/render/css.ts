// The style compiler (07 §4): one scoped `.n-{id}` rule per styled node, with
// desktop-first media queries for tablet (≤ 1024 px) and mobile (≤ 640 px)
// overrides and per-breakpoint visibility. Values come only from the closed
// vocabulary's parser; node ids are validated, so class names are safe.
import { styleDeclarations } from "../document/styles";
import { NODE_ID_RE, type BuilderNode, type PageDocument, type StyleSet } from "../document/types";
import type { Registry } from "../registry/types";

export const BREAKPOINTS = {
  tablet: "(max-width:1024px)",
  mobile: "(max-width:640px)",
  desktop: "(min-width:1025px)",
} as const;

const VARIABLE_NAME_RE = /^--sv-[a-z][a-z0-9-]{0,40}$/;
const VARIABLE_VALUE_RE = /^[A-Za-z0-9 .,%()#-]{1,100}$/;

function variables(values: Readonly<Record<string, string>> | undefined): string {
  if (!values) return "";
  return Object.entries(values)
    .filter(([name, value]) => VARIABLE_NAME_RE.test(name) && VARIABLE_VALUE_RE.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

const join = (...parts: string[]) => parts.filter(Boolean).join(";");

export function compileDocumentCss(document: PageDocument, registry: Registry): string {
  const base: string[] = [];
  const tablet: string[] = [];
  const mobile: string[] = [];
  const desktop: string[] = [];

  const visit = (node: BuilderNode): void => {
    if (node.hidden || !NODE_ID_RE.test(node.id)) return;
    const definition = registry.get(node.type);
    if (!definition) return;
    const selector = `.n-${node.id}`;
    const props = { ...definition.defaultProps, ...node.props };
    const rule = (styles: StyleSet | undefined, extraProps: object | undefined, hide: boolean) =>
      join(
        styleDeclarations(styles ?? {}),
        extraProps ? variables(definition.cssVariables?.({ ...props, ...extraProps })) : "",
        hide ? "display:none" : "",
      );

    const own = join(styleDeclarations(node.styles), variables(definition.cssVariables?.(props)));
    if (own) base.push(`${selector}{${own}}`);
    const t = rule(
      node.responsive?.tablet?.styles,
      node.responsive?.tablet?.props,
      node.visibility?.tablet === false,
    );
    if (t) tablet.push(`${selector}{${t}}`);
    const m = rule(
      node.responsive?.mobile?.styles,
      node.responsive?.mobile?.props,
      node.visibility?.mobile === false,
    );
    if (m) mobile.push(`${selector}{${m}}`);
    if (node.visibility?.desktop === false) desktop.push(`${selector}{display:none}`);
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of document.root) visit(node);

  return [
    base.join(""),
    desktop.length ? `@media ${BREAKPOINTS.desktop}{${desktop.join("")}}` : "",
    tablet.length ? `@media ${BREAKPOINTS.tablet}{${tablet.join("")}}` : "",
    mobile.length ? `@media ${BREAKPOINTS.mobile}{${mobile.join("")}}` : "",
  ].join("");
}
