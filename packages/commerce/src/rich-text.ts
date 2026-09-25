// Rich-text descriptions (ADR-0027 §10). The canonical form is a
// Tiptap/ProseMirror JSON document restricted to an allow-list of nodes and
// marks; HTML is only ever produced here, by an escaping serializer, from a
// validated document. No input path accepts HTML. Pure and client-safe.

export interface RichTextMark {
  readonly type: "bold" | "italic" | "strike" | "code" | "link";
  readonly attrs?: { readonly href: string };
}

export interface RichTextNode {
  readonly type:
    | "doc"
    | "paragraph"
    | "heading"
    | "bulletList"
    | "orderedList"
    | "listItem"
    | "blockquote"
    | "hardBreak"
    | "horizontalRule"
    | "text";
  readonly attrs?: { readonly level?: 2 | 3 | 4; readonly start?: number };
  readonly content?: readonly RichTextNode[];
  readonly text?: string;
  readonly marks?: readonly RichTextMark[];
}

export type RichTextDoc = RichTextNode & { readonly type: "doc" };

export const RICH_TEXT_LIMITS = {
  maxDepth: 12,
  maxNodes: 5_000,
  maxTextLength: 50_000,
  maxHrefLength: 2_048,
} as const;

export class RichTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RichTextError";
  }
}

/** Which children each block may contain. */
const CHILDREN: Record<string, ReadonlySet<string>> = {
  doc: new Set([
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "blockquote",
    "horizontalRule",
  ]),
  paragraph: new Set(["text", "hardBreak"]),
  heading: new Set(["text", "hardBreak"]),
  bulletList: new Set(["listItem"]),
  orderedList: new Set(["listItem"]),
  listItem: new Set(["paragraph", "bulletList", "orderedList"]),
  blockquote: new Set(["paragraph", "heading", "bulletList", "orderedList"]),
};

const MARKS = new Set(["bold", "italic", "strike", "code", "link"]);

/** Only web and mail links; never javascript:, data:, vbscript: or relative tricks. */
export function isSafeHref(href: string): boolean {
  if (href.length === 0 || href.length > RICH_TEXT_LIMITS.maxHrefLength) return false;
  // Control characters and whitespace can smuggle schemes past naive checks.
  for (let i = 0; i < href.length; i += 1) {
    const code = href.charCodeAt(i);
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
  }
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Budget {
  nodes: number;
  text: number;
}

function validateMarks(raw: unknown): RichTextMark[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > MARKS.size) throw new RichTextError("Invalid marks.");
  const marks: RichTextMark[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item) || typeof item["type"] !== "string" || !MARKS.has(item["type"])) {
      throw new RichTextError("Unsupported formatting.");
    }
    const type = item["type"] as RichTextMark["type"];
    if (seen.has(type)) continue;
    seen.add(type);
    if (type === "link") {
      const attrs = item["attrs"];
      const href = isRecord(attrs) && typeof attrs["href"] === "string" ? attrs["href"].trim() : "";
      if (!isSafeHref(href))
        throw new RichTextError("Links must start with http, https or mailto.");
      marks.push({ type, attrs: { href } });
    } else {
      marks.push({ type });
    }
  }
  return marks.length > 0 ? marks : undefined;
}

function validateNode(raw: unknown, parent: string, depth: number, budget: Budget): RichTextNode {
  if (depth > RICH_TEXT_LIMITS.maxDepth)
    throw new RichTextError("The description is nested too deeply.");
  budget.nodes += 1;
  if (budget.nodes > RICH_TEXT_LIMITS.maxNodes)
    throw new RichTextError("The description is too long.");
  if (!isRecord(raw) || typeof raw["type"] !== "string")
    throw new RichTextError("Invalid content.");
  const type = raw["type"];
  const allowed = CHILDREN[parent];
  if (!allowed?.has(type)) throw new RichTextError(`Unsupported content: ${type.slice(0, 40)}.`);

  if (type === "text") {
    const text = raw["text"];
    if (typeof text !== "string" || text.length === 0) throw new RichTextError("Invalid text.");
    budget.text += text.length;
    if (budget.text > RICH_TEXT_LIMITS.maxTextLength)
      throw new RichTextError("The description is too long.");
    const marks = validateMarks(raw["marks"]);
    return marks ? { type, text, marks } : { type, text };
  }
  if (type === "hardBreak" || type === "horizontalRule") return { type };

  const node: {
    type: RichTextNode["type"];
    attrs?: NonNullable<RichTextNode["attrs"]>;
    content?: RichTextNode[];
  } = {
    type: type as RichTextNode["type"],
  };
  const attrs = isRecord(raw["attrs"]) ? raw["attrs"] : {};
  if (type === "heading") {
    const level = attrs["level"];
    if (level !== 2 && level !== 3 && level !== 4)
      throw new RichTextError("Headings are levels 2 to 4.");
    node.attrs = { level };
  }
  if (type === "orderedList") {
    const start = attrs["start"];
    if (typeof start === "number" && Number.isInteger(start) && start > 1 && start < 1_000_000) {
      node.attrs = { start };
    }
  }
  const content = raw["content"];
  if (content !== undefined) {
    if (!Array.isArray(content)) throw new RichTextError("Invalid content.");
    const children = content.map((child) => validateNode(child, type, depth + 1, budget));
    if (children.length > 0) node.content = children;
  }
  if ((type === "bulletList" || type === "orderedList" || type === "listItem") && !node.content) {
    throw new RichTextError("Lists need at least one item.");
  }
  return node;
}

/**
 * Validates untrusted input (from a form) against the allow-list and returns
 * a normalised copy with unknown attributes dropped. Throws RichTextError.
 * An empty document (no text at all) normalises to null.
 */
export function parseRichText(input: unknown): RichTextDoc | null {
  if (input === null || input === undefined || input === "") return null;
  let value: unknown = input;
  if (typeof input === "string") {
    if (input.length > 1_000_000) throw new RichTextError("The description is too long.");
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new RichTextError("Invalid description.");
    }
  }
  if (!isRecord(value) || value["type"] !== "doc") throw new RichTextError("Invalid description.");
  const budget: Budget = { nodes: 0, text: 0 };
  const content = value["content"];
  if (content !== undefined && !Array.isArray(content))
    throw new RichTextError("Invalid description.");
  const list: unknown[] = Array.isArray(content) ? content : [];
  const children = list.map((child) => validateNode(child, "doc", 1, budget));
  if (budget.text === 0 && !children.some((c) => c.type === "horizontalRule")) return null;
  return { type: "doc", content: children };
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const MARK_ORDER: RichTextMark["type"][] = ["link", "bold", "italic", "strike", "code"];

function renderText(node: RichTextNode): string {
  let html = escapeHtml(node.text ?? "");
  const marks = [...(node.marks ?? [])].sort(
    (a, b) => MARK_ORDER.indexOf(b.type) - MARK_ORDER.indexOf(a.type),
  );
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "strike":
        html = `<s>${html}</s>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "link": {
        // Re-checked at render: the serializer never trusts its input.
        const href = mark.attrs?.href ?? "";
        if (isSafeHref(href)) {
          html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow ugc">${html}</a>`;
        }
        break;
      }
    }
  }
  return html;
}

function renderNode(node: RichTextNode): string {
  const inner = () => (node.content ?? []).map(renderNode).join("");
  switch (node.type) {
    case "doc":
      return inner();
    case "paragraph":
      return `<p>${inner()}</p>`;
    case "heading": {
      const level = node.attrs?.level === 3 || node.attrs?.level === 4 ? node.attrs.level : 2;
      return `<h${String(level)}>${inner()}</h${String(level)}>`;
    }
    case "bulletList":
      return `<ul>${inner()}</ul>`;
    case "orderedList": {
      const start = node.attrs?.start;
      return start && Number.isInteger(start) && start > 1
        ? `<ol start="${String(start)}">${inner()}</ol>`
        : `<ol>${inner()}</ol>`;
    }
    case "listItem":
      return `<li>${inner()}</li>`;
    case "blockquote":
      return `<blockquote>${inner()}</blockquote>`;
    case "hardBreak":
      return "<br>";
    case "horizontalRule":
      return "<hr>";
    case "text":
      return renderText(node);
  }
}

/** HTML from a validated document. Every text and attribute value is escaped. */
export function renderRichTextHtml(doc: RichTextDoc | null): string | null {
  if (!doc) return null;
  return renderNode(doc);
}

/** Plain text (for search, excerpts and meta descriptions). */
export function richTextToPlainText(doc: RichTextDoc | null, maxLength = 5_000): string {
  if (!doc) return "";
  const parts: string[] = [];
  const walk = (node: RichTextNode) => {
    if (node.type === "text") parts.push(node.text ?? "");
    else if (node.type === "hardBreak") parts.push(" ");
    for (const child of node.content ?? []) walk(child);
    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem")
      parts.push(" ");
  };
  walk(doc);
  return parts.join("").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** A document of plain paragraphs, for seeds, imports and tests. */
export function plainTextToRichText(text: string): RichTextDoc | null {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  return {
    type: "doc",
    content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  };
}
