import { DEFAULT_REGISTRY, type RenderContext } from "@storevia/editor/registry";
import { RenderDocument, compileDocumentCss } from "@storevia/editor/render";
import type { PageDocument } from "@storevia/editor/document";

/** A page document rendered with its scoped styles (07 §4–§5). */
export function StorePage({
  document,
  ctx,
  nonce,
  children,
}: {
  document: PageDocument;
  ctx: RenderContext;
  nonce: string | undefined;
  children?: React.ReactNode;
}) {
  const css = compileDocumentCss(document, DEFAULT_REGISTRY);
  return (
    <main id="main">
      {css ? <style nonce={nonce}>{css}</style> : null}
      <RenderDocument document={document} registry={DEFAULT_REGISTRY} ctx={ctx} />
      {children}
    </main>
  );
}

/** JSON-LD, escaped so no value can close the script element. */
export function JsonLd({ data, nonce }: { data: unknown; nonce: string | undefined }) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return (
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />
  );
}
