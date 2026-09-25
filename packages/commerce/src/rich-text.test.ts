import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  isSafeHref,
  parseRichText,
  plainTextToRichText,
  renderRichTextHtml,
  richTextToPlainText,
  RichTextError,
} from "./rich-text";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

describe("parseRichText", () => {
  it("accepts the allow-listed structure and renders escaped HTML", () => {
    const parsed = parseRichText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Care")] },
        p(text("Wash "), text("cold", [{ type: "bold" }]), text(" <script>")),
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [p(text("Line dry"))] }],
        },
        p(
          text("See ", []),
          text("guide", [{ type: "link", attrs: { href: "https://example.com/?a=1&b=2" } }]),
        ),
      ),
    );
    expect(renderRichTextHtml(parsed)).toBe(
      "<h2>Care</h2><p>Wash <strong>cold</strong> &lt;script&gt;</p><ul><li><p>Line dry</p></li></ul>" +
        '<p>See <a href="https://example.com/?a=1&amp;b=2" rel="noopener noreferrer nofollow ugc">guide</a></p>',
    );
    expect(richTextToPlainText(parsed)).toBe("Care Wash cold <script> Line dry See guide");
  });

  it.each([
    ["an HTML string", "<p>hi</p>"],
    ["an unknown node", doc({ type: "image", attrs: { src: "x" } })],
    ["raw HTML node", doc({ type: "html", content: "<img onerror=alert(1)>" })],
    ["h1", doc({ type: "heading", attrs: { level: 1 }, content: [text("x")] })],
    ["a text node at the top level", doc(text("loose"))],
    ["an unknown mark", doc(p(text("x", [{ type: "highlight" }])))],
    [
      "javascript: links",
      doc(p(text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]))),
    ],
    [
      "obfuscated javascript: links",
      doc(p(text("x", [{ type: "link", attrs: { href: "java\tscript:alert(1)" } }]))),
    ],
    [
      "data: links",
      doc(p(text("x", [{ type: "link", attrs: { href: "data:text/html,<script>" } }]))),
    ],
    ["relative links", doc(p(text("x", [{ type: "link", attrs: { href: "/admin" } }])))],
    ["an empty list", doc({ type: "bulletList", content: [] })],
  ])("refuses %s", (_, input) => {
    expect(() => parseRichText(input)).toThrow(RichTextError);
  });

  it("drops unknown attributes and treats an empty document as no description", () => {
    const parsed = parseRichText(
      doc({ type: "paragraph", attrs: { style: "x", onclick: "y" }, content: [text("a")] }),
    );
    expect(parsed).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
    });
    expect(parseRichText(doc(p()))).toBeNull();
    expect(parseRichText("")).toBeNull();
  });

  it("bounds nesting and size", () => {
    let node: unknown = p(text("deep"));
    for (let i = 0; i < 20; i += 1) node = { type: "blockquote", content: [node] };
    expect(() => parseRichText(doc(node))).toThrow(RichTextError);
    expect(() => parseRichText(doc(p(text("x".repeat(60_000)))))).toThrow("too long");
  });

  it("never emits markup from text (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (value) => {
        fc.pre(value.length > 0);
        const html = renderRichTextHtml(parseRichText(doc(p(text(value))))) ?? "";
        expect(html).toBe(`<p>${escapeHtml(value)}</p>`);
        expect(html.slice(3, -4)).not.toMatch(/[<>"']/);
      }),
    );
  });

  it("round-trips plain paragraphs", () => {
    const d = plainTextToRichText("One.\n\nTwo.");
    expect(renderRichTextHtml(parseRichText(d))).toBe("<p>One.</p><p>Two.</p>");
  });
});

describe("isSafeHref", () => {
  it.each([
    ["https://storevia.test", true],
    ["http://a.test/x", true],
    ["mailto:hi@example.test", true],
    ["JAVASCRIPT:alert(1)", false],
    [" https://a.test", false],
    ["vbscript:x", false],
    ["//evil.test", false],
  ])("%s → %s", (href, ok) => {
    expect(isSafeHref(href)).toBe(ok);
  });
});
