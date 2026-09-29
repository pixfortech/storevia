// Store policies in the dashboard (final pass, Phase 2A), client-safe:
// status and requirement wording, editor paths, and the editor's check for
// text of the merchant's own (the server decides; this only disables the
// Publish button until there is some).
import type { PolicyDefinition } from "@storevia/commerce/policy-kinds";
import type { BadgeTone } from "@storevia/ui/surfaces";
import { settingsPath } from "./settings-tabs";

export type PolicyStatus = "empty" | "draft" | "published" | "changed";

export const POLICY_STATUS: Record<PolicyStatus, { label: string; tone: BadgeTone }> = {
  empty: { label: "Not written", tone: "neutral" },
  draft: { label: "Draft", tone: "warning" },
  published: { label: "Published", tone: "success" },
  changed: { label: "Unpublished changes", tone: "info" },
};

/** Whether the store needs the policy published to go live, in words. */
export function policyRequirementLabel(definition: Pick<PolicyDefinition, "requirement">): string {
  switch (definition.requirement) {
    case "always":
      return "Required to go live";
    case "when-shipping":
      return "Required to go live when you sell products that ship";
    case "optional":
      return "Optional";
  }
}

/** The editor for one policy: /settings/policies/{handle}. */
export const policyEditorPath = (storeId: string, handle: string) =>
  settingsPath(storeId, `/policies/${handle}`);

interface DocNode {
  readonly type?: string | undefined;
  readonly text?: string | undefined;
  readonly content?: readonly DocNode[] | undefined;
}

const textOf = (node: DocNode): string =>
  (node.text ?? "") + (node.content ?? []).map(textOf).join("");

/** The document's text outside headings (a starter of headings alone has none). */
export function policyOwnText(doc: DocNode | null | undefined): string {
  return (doc?.content ?? [])
    .filter((node) => node.type !== "heading")
    .map(textOf)
    .join(" ")
    .trim();
}

/** Nothing written yet (empty paragraphs at most): starter headings replace it. */
export function isBlankDoc(doc: DocNode | null | undefined): boolean {
  return (doc?.content ?? []).every((node) => textOf(node).trim() === "");
}
