import { STOREVIA_REGISTRY, type CommerceRenderContext } from "@storevia/commerce/blocks";
import type { PageDocument } from "@storevia/editor/document";
import { RenderDocument, compileDocumentCss } from "@storevia/editor/render";

/** A page document rendered with its scoped styles (07 §4–§5). */
export function StorePage({
  document,
  ctx,
  nonce,
  heading,
  children,
}: {
  document: PageDocument;
  ctx: CommerceRenderContext;
  nonce: string | undefined;
  /** The page's h1 when its first section doesn't carry one. */
  heading?: string | undefined;
  children?: React.ReactNode;
}) {
  const css = compileDocumentCss(document, STOREVIA_REGISTRY);
  return (
    <main id="main">
      {css ? <style nonce={nonce}>{css}</style> : null}
      {heading ? <h1 className="sv-visually-hidden">{heading}</h1> : null}
      <RenderDocument document={document} registry={STOREVIA_REGISTRY} ctx={ctx} />
      {children}
    </main>
  );
}

export { JsonLd } from "@storevia/site-engine/shell";
