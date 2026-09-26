// Rendering a validated document with the registry's server renderers, and
// collecting everything the page needs before it renders (06 §4): one walk
// gathers the data requests, typed links and media references, so the host
// resolves each kind in one batch instead of per node.
import type { ReactNode } from "react";
import type { LinkTarget } from "../document/refs";
import { collectRefs } from "../document/refs";
import type { BuilderNode, PageDocument } from "../document/types";
import {
  dataRequestKey,
  type DataRequest,
  type Registry,
  type RenderContext,
} from "../registry/types";

export interface PageRequirements {
  readonly requests: readonly DataRequest[];
  readonly links: readonly LinkTarget[];
  /** Media TypeIds. */
  readonly media: readonly string[];
}

export function collectRequirements(document: PageDocument, registry: Registry): PageRequirements {
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
    const refs = collectRefs(parsed.data);
    for (const link of refs.links) links.set(JSON.stringify(link), link);
    for (const id of refs.media) media.add(id);
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of document.root) visit(node);
  return { requests: [...requests.values()], links: [...links.values()], media: [...media] };
}

function renderNode(node: BuilderNode, registry: Registry, ctx: RenderContext): ReactNode {
  if (node.hidden) return null;
  const definition = registry.get(node.type);
  if (!definition) {
    // A bad deploy or rollback degrades a section instead of the site (07 §7).
    ctx.onUnknownComponent?.(node.type);
    return null;
  }
  const parsed = definition.propertySchema.safeParse({ ...definition.defaultProps, ...node.props });
  if (!parsed.success) return null;
  const children =
    definition.allowedChildren === "none"
      ? null
      : (node.children ?? []).map((child) => renderNode(child, registry, ctx));
  return (
    <DefinitionRenderer
      key={node.id}
      render={definition.render}
      args={{ node, props: parsed.data, className: `n-${node.id}`, children, ctx }}
    />
  );
}

function DefinitionRenderer<A>({ render, args }: { render: (args: A) => ReactNode; args: A }) {
  return render(args);
}

export function RenderDocument({
  document,
  registry,
  ctx,
}: {
  document: PageDocument;
  registry: Registry;
  ctx: RenderContext;
}) {
  return <>{document.root.map((node) => renderNode(node, registry, ctx))}</>;
}
