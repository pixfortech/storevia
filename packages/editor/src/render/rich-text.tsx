// Rich text as React elements (07 §6). The document is re-validated against
// the allow-list (@storevia/commerce/rich-text) before rendering, text is
// escaped by React, and link hrefs pass the same safety check again, so a
// stored document can't inject markup or script even if it was tampered
// with. No HTML strings, no dangerouslySetInnerHTML.
import { isSafeHref, type RichTextNode } from "@storevia/commerce/rich-text";
import { safeRichText } from "../document/refs";
import type { ReactNode } from "react";

function marked(node: RichTextNode, key: number): ReactNode {
  let out: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "code":
        out = <code>{out}</code>;
        break;
      case "link":
        out =
          mark.attrs && isSafeHref(mark.attrs.href) ? (
            <a href={mark.attrs.href} rel="noopener noreferrer nofollow">
              {out}
            </a>
          ) : (
            out
          );
        break;
    }
  }
  return <span key={key}>{out}</span>;
}

function renderNode(node: RichTextNode, key: number): ReactNode {
  const children = (node.content ?? []).map((child, i) => renderNode(child, i));
  switch (node.type) {
    case "text":
      return marked(node, key);
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading": {
      const level = node.attrs?.level ?? 2;
      return level === 2 ? (
        <h2 key={key}>{children}</h2>
      ) : level === 3 ? (
        <h3 key={key}>{children}</h3>
      ) : (
        <h4 key={key}>{children}</h4>
      );
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={node.attrs?.start}>
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "doc":
      return children;
  }
}

export function RichText({ doc, className }: { doc: unknown; className?: string }) {
  const valid = safeRichText(doc);
  if (!valid) return null;
  return <div className={className ?? "sv-prose"}>{renderNode(valid, 0)}</div>;
}
