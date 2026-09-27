// Section operations (ADR-0030 §1): the builder's only way of changing a
// document's structure keeps it valid by construction.
import { describe, expect, it } from "vitest";
import { SITE_REGISTRY } from "../registry";
import {
  OperationError,
  createSection,
  duplicateSection,
  insertSection,
  moveSection,
  newNodeId,
  removeSection,
  setSectionHidden,
  setSectionVisibility,
  updateSectionProps,
} from "./operations";
import { DOCUMENT_LIMITS, NODE_ID_RE, type BuilderNode, type PageDocument } from "./types";
import { validateDocument } from "./validate";

const empty: PageDocument = { schemaVersion: 1, root: [] };
const ids = (d: PageDocument) => d.root.map((n) => n.id);
const valid = (d: PageDocument) =>
  validateDocument(d, { registry: SITE_REGISTRY, pageKind: "HOME" }).ok;

function build(...types: string[]): PageDocument {
  return types.reduce((d, type) => insertSection(d, createSection(SITE_REGISTRY, type, d)), empty);
}

describe("section operations", () => {
  it("node ids are 12 URL-safe characters from a CSPRNG", () => {
    const seen = new Set(Array.from({ length: 500 }, newNodeId));
    expect(seen.size).toBe(500);
    for (const id of seen) expect(id).toMatch(NODE_ID_RE);
  });

  it("adds sections with their default settings, and the result validates", () => {
    const d = build("hero", "faq", "gallery");
    expect(d.root.map((n) => n.type)).toEqual(["hero", "faq", "gallery"]);
    expect(d.root[1]?.props).toEqual(SITE_REGISTRY.get("faq")?.defaultProps);
    expect(valid(d)).toBe(true);
    // Defaults are copied, never shared with the registry.
    expect(d.root[1]?.props).not.toBe(SITE_REGISTRY.get("faq")?.defaultProps);
  });

  it("refuses types that aren't section blocks", () => {
    for (const type of ["heading", "column", "marquee", "product-grid"]) {
      expect(() => createSection(SITE_REGISTRY, type, empty)).toThrow(OperationError);
    }
  });

  it("inserts at a position and refuses duplicate or malformed ids", () => {
    const d = build("hero", "faq");
    const cta = createSection(SITE_REGISTRY, "call-to-action", d);
    expect(insertSection(d, cta, 1).root.map((n) => n.type)).toEqual([
      "hero",
      "call-to-action",
      "faq",
    ]);
    expect(() => insertSection(d, { ...cta, id: d.root[0]?.id ?? "" })).toThrow(/unique/);
    expect(() => insertSection(d, { ...cta, id: "bad" })).toThrow(/unique/);
  });

  it(`stops at ${String(DOCUMENT_LIMITS.maxSections)} sections`, () => {
    let d = empty;
    for (let i = 0; i < DOCUMENT_LIMITS.maxSections; i++)
      d = insertSection(d, createSection(SITE_REGISTRY, "faq", d));
    expect(() => insertSection(d, createSection(SITE_REGISTRY, "faq", d))).toThrow(/at most 40/);
  });

  it("moves up and down without ever losing or duplicating a section", () => {
    const d = build("hero", "faq", "gallery");
    const [a, b, c] = ids(d) as [string, string, string];
    expect(ids(moveSection(d, c, -1))).toEqual([a, c, b]);
    expect(ids(moveSection(d, a, 1))).toEqual([b, a, c]);
    // Past either end: unchanged.
    expect(moveSection(d, a, -1)).toBe(d);
    expect(moveSection(d, c, 1)).toBe(d);
    expect(moveSection(d, b, 0.5)).toBe(d);
    let shuffled = d;
    for (const step of [1, 1, -1, 1, -1, -1, 1]) shuffled = moveSection(shuffled, b, step);
    expect([...ids(shuffled)].sort()).toEqual([...ids(d)].sort());
    expect(() => moveSection(d, "nothere12345", 1)).toThrow(/no longer exists/);
  });

  it("duplicates with new ids for the section and everything inside it", () => {
    const nested: BuilderNode = {
      id: "sectionaaaaa",
      type: "section",
      props: { label: "", width: "contained" },
      styles: {},
      children: [
        { id: "headingaaaaa", type: "heading", props: { text: "Hi", level: 2 }, styles: {} },
      ],
    };
    const d = insertSection(build("faq"), nested);
    const copied = duplicateSection(d, "sectionaaaaa");
    expect(copied.root).toHaveLength(3);
    const copy = copied.root[2];
    expect(copy?.type).toBe("section");
    expect(copy?.id).not.toBe("sectionaaaaa");
    expect(copy?.children?.[0]?.id).not.toBe("headingaaaaa");
    expect(copy?.children?.[0]?.props).toEqual({ text: "Hi", level: 2 });
    expect(valid(copied)).toBe(true);
    const all = copied.root.flatMap((n) => [n.id, ...(n.children ?? []).map((c) => c.id)]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("updates settings, hides, sets per-device visibility and removes", () => {
    const d = build("hero", "faq");
    const faq = ids(d)[1] ?? "";
    const updated = updateSectionProps(d, faq, {
      ...(d.root[1]?.props ?? {}),
      heading: "Questions",
    });
    expect(updated.root[1]?.props["heading"]).toBe("Questions");
    expect(d.root[1]?.props["heading"]).toBe("");
    expect(setSectionHidden(d, faq, true).root[1]?.hidden).toBe(true);
    expect(setSectionHidden(setSectionHidden(d, faq, true), faq, false).root[1]).not.toHaveProperty(
      "hidden",
    );
    expect(setSectionVisibility(d, faq, { mobile: false }).root[1]?.visibility).toEqual({
      mobile: false,
    });
    expect(setSectionVisibility(d, faq, { mobile: true }).root[1]).not.toHaveProperty("visibility");
    expect(ids(removeSection(d, faq))).toEqual([ids(d)[0]]);
  });
});
