// Rendering a validated document with the registry's server renderers, and
// collecting everything the page needs before it renders (06 §4): one walk
// gathers the data requests, typed links and media references, so the host
// resolves each kind in one batch instead of per node.
import { Fragment, type ReactNode } from "react";
import type { LinkTarget } from "../document/refs";
import { collectRefs } from "../document/refs";
import type { BuilderNode, PageDocument } from "../document/types";
import {
  dataRequestKey,
  type DataRequest,
  type Registry,
  type SiteRenderContext,
} from "../registry/types";

export interface PageRequirements {
  readonly requests: readonly DataRequest[];
  readonly links: readonly LinkTarget[];
  /** Media TypeIds. */
  readonly media: readonly string[];
}

export function collectRequirements<C extends SiteRenderContext>(
  document: PageDocument,
  registry: Registry<C>,
): PageRequirements {
  const requests = new Map<string, DataRequest>();
  const links = new Map<string, LinkTarget>();
  const media = new Set<string>();
  const visit = (node: BuilderNode): void => {
    if (node.hidden) return;
    const definition = registry.get(node.type);
    if (!definition) return;
    const props = { ...definition.defaultProps, ...node.props };
    const parsed = definition.propertySchema.safeParse(props);
    if (!parsed.success) return;
    for (const request of definition.dataRequirements?.(parsed.data) ?? []) {
      requests.set(dataRequestKey(request), request);
    }
    const refs = collectRefs(parsed.data, registry.linkSchema);
    for (const link of refs.links) links.set(JSON.stringify(link), link);
    for (const id of refs.media) media.add(id);
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of document.root) visit(node);
  return { requests: [...requests.values()], links: [...links.values()], media: [...media] };
}

function renderNode<C extends SiteRenderContext>(
  node: BuilderNode,
  registry: Registry<C>,
  ctx: C,
  position: number | null,
): ReactNode {
  if (node.hidden) return null;
  const definition = registry.get(node.type);
  if (!definition) {
    // A bad deploy or rollback degrades a section instead of the site (07 §7).
    ctx.onUnknownComponent?.(node.type);
    return null;
  }
  const parsed = definition.propertySchema.safeParse({ ...definition.defaultProps, ...node.props });
  if (!parsed.success) {
    ctx.onInvalidComponent?.(node.type);
    return null;
  }
  const children =
    definition.allowedChildren === "none"
      ? null
      : (node.children ?? []).map((child) => renderNode(child, registry, ctx, null));
  return (
    <DefinitionRenderer
      key={node.id}
      render={definition.render}
      args={{ node, props: parsed.data, className: `n-${node.id}`, children, ctx, position }}
    />
  );
}

function DefinitionRenderer<A>({ render, args }: { render: (args: A) => ReactNode; args: A }) {
  return render(args);
}

export function RenderDocument<C extends SiteRenderContext>({
  document,
  registry,
  ctx,
  wrapSection,
}: {
  document: PageDocument;
  registry: Registry<C>;
  ctx: C;
  /** The builder canvas wraps each section (selection, outlines); the public site never does. */
  wrapSection?: (node: BuilderNode, position: number, content: ReactNode) => ReactNode;
}) {
  return (
    <>
      {document.root.map((node, i) => {
        const content = renderNode(node, registry, ctx, i);
        return wrapSection ? (
          <Fragment key={node.id}>{wrapSection(node, i, content)}</Fragment>
        ) : (
          content
        );
      })}
    </>
  );
}

/**
 * Whether the page's first section renders its own heading (the page's h1).
 * When it doesn't, the host adds a visually hidden h1 with the page title.
 */
export function firstSectionHasHeading<C extends SiteRenderContext>(
  document: PageDocument,
  registry: Registry<C>,
): boolean {
  const first = document.root.find((node) => !node.hidden);
  if (!first) return false;
  const definition = registry.get(first.type);
  if (!definition?.headingProp) return false;
  // The hero falls back to the site's name, so it always has one.
  if (first.type === "hero") return true;
  const value = { ...definition.defaultProps, ...first.props }[definition.headingProp];
  return typeof value === "string" && value.trim() !== "";
}
