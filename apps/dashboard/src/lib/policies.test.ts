import { POLICY_DEFINITIONS, policyRequired } from "@storevia/commerce/policy-kinds";
import { describe, expect, it } from "vitest";
import { isBlankDoc, policyEditorPath, policyOwnText, policyRequirementLabel } from "./policies";

const heading = (text: string) => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});
const paragraph = (text?: string) => ({
  type: "paragraph",
  ...(text ? { content: [{ type: "text", text }] } : {}),
});

describe("policy editor helpers", () => {
  it("starter headings alone aren't text of the merchant's own", () => {
    const starter = { type: "doc", content: [heading("Returns"), heading("Refunds")] };
    expect(policyOwnText(starter)).toBe("");
    expect(policyOwnText(null)).toBe("");
    expect(
      policyOwnText({ type: "doc", content: [heading("Returns"), paragraph("Within 7 days.")] }),
    ).toBe("Within 7 days.");
    const list = {
      type: "doc",
      content: [{ type: "bulletList", content: [{ type: "listItem", content: [paragraph("A")] }] }],
    };
    expect(policyOwnText(list)).toBe("A");
  });

  it("a blank document is replaced by the starter; anything written is kept", () => {
    expect(isBlankDoc(null)).toBe(true);
    expect(isBlankDoc({ type: "doc", content: [paragraph()] })).toBe(true);
    expect(isBlankDoc({ type: "doc", content: [heading("Returns")] })).toBe(false);
    expect(isBlankDoc({ type: "doc", content: [paragraph("Hello")] })).toBe(false);
  });

  it("requirements match what the launch checks enforce", () => {
    for (const definition of POLICY_DEFINITIONS) {
      const label = policyRequirementLabel(definition);
      if (policyRequired(definition.kind, false)) expect(label).toBe("Required to go live");
      else if (policyRequired(definition.kind, true)) expect(label).toMatch(/ship/);
      else expect(label).toBe("Optional");
    }
  });

  it("the editor URL carries the storefront handle", () => {
    expect(policyEditorPath("store_abc", "refunds")).toBe("/s/store_abc/settings/policies/refunds");
  });
});
