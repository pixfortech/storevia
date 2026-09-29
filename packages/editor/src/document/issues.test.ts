// Validation problems in words (PB-3): each issue maps to its section, the
// settings control that fixes it and a message a merchant can act on.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SITE_REGISTRY } from "../registry";
import {
  describeIssues,
  inputConstraints,
  problemText,
  problemsSummary,
  type DocumentProblem,
} from "./issues";
import { issueMessage, validateDocument } from "./validate";

const section = (id: string, type: string, props: object = {}, extra: object = {}) => ({
  id,
  type,
  props,
  styles: {},
  ...extra,
});
const doc = (...root: object[]) => ({ schemaVersion: 1, root });

function problems(document: unknown): DocumentProblem[] {
  const result = validateDocument(document, { registry: SITE_REGISTRY, pageKind: "HOME" });
  return result.ok ? [] : describeIssues(document, result.issues, SITE_REGISTRY);
}

describe("describeIssues", () => {
  it("names the section, the control and a readable message for an emptied button label", () => {
    const found = problems(
      doc(
        section("heroFirst001", "hero", { heading: "Fine" }),
        section("heroSecond01", "hero", { cta: { label: "", link: { type: "home" } } }),
      ),
    );
    expect(found).toEqual([
      {
        path: "root.1.props.cta.label",
        sectionId: "heroSecond01",
        sectionIndex: 1,
        section: "Section 2 · Hero",
        field: "cta.label",
        fieldLabel: "Button › Button text",
        message: "Enter at least 1 character.",
      },
    ]);
    expect(found.map(problemText)).toEqual([
      "Section 2 · Hero › Button › Button text: Enter at least 1 character.",
    ]);
  });

  it("names the list item for a field inside a list", () => {
    const [problem] = problems(
      doc(
        section("featuresA001", "features", {
          items: [
            { title: "One", text: "", image: null },
            { title: "x".repeat(121), text: "", image: null },
          ],
        }),
      ),
    );
    expect(problem).toMatchObject({
      section: "Section 1 · Features",
      field: "items.1.title",
      fieldLabel: "Points, item 2 › Title",
      message: "Use 120 characters or fewer.",
    });
  });

  it("asks for a choice when a link names a kind of record but none is chosen", () => {
    const found = problems(
      doc(
        section("heroLinkA001", "hero", { cta: { label: "Go", link: { type: "page", id: "" } } }),
        section("logosA000001", "logo-strip", {
          logos: [{ image: null, name: "Kiln", link: { type: "page", id: "" } }],
        }),
      ),
    );
    expect(found.map((p) => [p.field, p.fieldLabel, p.message])).toEqual([
      ["cta.link", "Button › Goes to", "Choose a page."],
      ["logos.0.link", "Logos, item 1 › Link", "Choose a page."],
    ]);
  });

  it("keeps problems no control shows at the section, and page-wide ones at the page", () => {
    const found = problems(
      doc(
        section("unknownType1", "marquee"),
        section("styledHero01", "hero", {}, { styles: { color: "red; x" } }),
      ),
    );
    expect(found).toEqual([
      expect.objectContaining({
        section: "Section 1",
        field: null,
        fieldLabel: null,
        message: 'Unknown component "marquee".',
      }),
      expect.objectContaining({ section: "Section 2 · Hero", field: null, fieldLabel: null }),
    ]);
    const tooMany = problems({
      schemaVersion: 1,
      root: Array.from({ length: 41 }, (_, i) =>
        section(`faq${String(i).padStart(9, "0")}`, "faq"),
      ),
    });
    expect(tooMany).toEqual([
      expect.objectContaining({ section: null, sectionIndex: null, field: null }),
    ]);
    expect(tooMany.map(problemText)).toEqual(["A page can have at most 40 sections."]);
  });

  it("reports one problem per control, never a raw path", () => {
    const found = problems(
      doc(
        section("heroTwice001", "hero", {
          cta: { label: "\u0001", link: { type: "page", id: "" } },
        }),
      ),
    );
    expect(found.map((p) => p.field)).toEqual(["cta.label", "cta.link"]);
    for (const p of found) expect(problemText(p)).not.toMatch(/root\.|props\./);
    expect(problemsSummary([...found, ...found], 3)).toMatch(/\(and 1 more\)$/);
  });
});

describe("issueMessage", () => {
  const messageFor = (schema: z.ZodType, value: unknown) => {
    const result = schema.safeParse(value);
    return result.success ? null : result.error.issues.map(issueMessage);
  };

  it("turns zod's generic messages into ones a merchant can act on", () => {
    expect(messageFor(z.number().int().min(1).max(48), 60)).toEqual(["Enter 48 or less."]);
    expect(messageFor(z.number().int().min(1).max(48), 0)).toEqual(["Enter 1 or more."]);
    expect(messageFor(z.number().int(), 1.5)).toEqual(["Enter a whole number."]);
    expect(messageFor(z.string().min(1), "")).toEqual(["Enter at least 1 character."]);
    expect(messageFor(z.string().min(3), "")).toEqual(["Enter at least 3 characters."]);
    expect(messageFor(z.string().max(80), "x".repeat(81))).toEqual(["Use 80 characters or fewer."]);
    expect(messageFor(z.array(z.string()).max(2), ["a", "b", "c"])).toEqual([
      "Use at most 2 items.",
    ]);
    expect(messageFor(z.enum(["a", "b"]), "c")).toEqual(["Choose one of the options."]);
    expect(messageFor(z.strictObject({}), { onload: "x" })).toEqual(["Unknown setting: onload."]);
    // A message the schema spells out is kept.
    expect(
      messageFor(
        z.string().refine(() => false, "Unsafe link."),
        "x",
      ),
    ).toEqual(["Unsafe link."]);
  });
});

describe("inputConstraints", () => {
  const hero = SITE_REGISTRY.get("hero")?.propertySchema;
  const features = SITE_REGISTRY.get("features")?.propertySchema;

  it("reads length and range limits from a props schema at a control key", () => {
    expect(inputConstraints(hero, "heading")).toEqual({ maxLength: 200 });
    expect(inputConstraints(hero, "cta.label")).toEqual({ minLength: 1, maxLength: 80 });
    expect(inputConstraints(features, "items.3.title")).toEqual({ maxLength: 120 });
    expect(inputConstraints(z.strictObject({ n: z.number().int().min(1).max(48) }), "n")).toEqual({
      min: 1,
      max: 48,
    });
  });

  it("gives no limit when the schema doesn't say", () => {
    expect(inputConstraints(hero, "nope")).toEqual({});
    expect(inputConstraints(hero, "image")).toEqual({});
    expect(inputConstraints(undefined, "heading")).toEqual({});
  });
});
