// Validation problems a merchant can act on (PB-3). The validator reports
// issues by path in the document ("root.2.props.cta.label"); this maps each
// one to the section it is in ("Section 3 · Hero"), the settings control
// that edits it ("Button › Button text", "Points, item 2 › Title") and a
// message, using the registry's own control labels. The builder runs it on
// the client before saving and on the issues the server returns, so both
// read the same way and nobody ever sees a raw path. Pure and isomorphic.
import type { PropertyControl, Registry, SiteRenderContext } from "../registry/types";
import type { ValidationIssue } from "./validate";

export interface DocumentProblem {
  /** The validator's path (machine data, never shown). */
  readonly path: string;
  /** The section the problem is in; null for the page as a whole. */
  readonly sectionId: string | null;
  /** 0-based position of that section. */
  readonly sectionIndex: number | null;
  /** "Section 3 · Hero". */
  readonly section: string | null;
  /**
   * The settings control that fixes it, as the builder keys its controls
   * ("heading", "cta.label", "items.1.title"); null when no control shows it.
   */
  readonly field: string | null;
  /** "Button › Button text"; null when no control shows it. */
  readonly fieldLabel: string | null;
  readonly message: string;
}

interface ResolvedField {
  readonly key: readonly string[];
  readonly labels: readonly string[];
  /** What the key names: a link picker gets a "choose a …" message. */
  readonly link: boolean;
}

/** The control (and sub-part) a props path belongs to. */
function resolveField(
  controls: readonly PropertyControl[],
  segments: readonly string[],
): ResolvedField | null {
  const [prop, ...rest] = segments;
  const control = controls.find((c) => c.prop === prop);
  if (!control || prop === undefined) return null;
  const whole: ResolvedField = { key: [prop], labels: [control.label], link: false };
  switch (control.kind) {
    case "items": {
      const index = Number(rest[0]);
      if (rest[0] === undefined || !Number.isInteger(index) || index < 0) return whole;
      const item = `${control.label}, item ${String(index + 1)}`;
      const inner = resolveField(control.fields ?? [], rest.slice(1));
      if (!inner) return { key: [prop], labels: [item], link: false };
      return {
        key: [prop, String(index), ...inner.key],
        labels: [item, ...inner.labels],
        link: inner.link,
      };
    }
    case "action":
      if (rest[0] === "label") {
        return { key: [prop, "label"], labels: [control.label, "Button text"], link: false };
      }
      if (rest[0] === "link") {
        return { key: [prop, "link"], labels: [control.label, "Goes to"], link: true };
      }
      return whole;
    case "link":
      return { ...whole, link: true };
    case "media":
      return rest[0] === "alt"
        ? { key: [prop], labels: [control.label, "Alternative text"], link: false }
        : whole;
    default:
      return whole;
  }
}

function valueAt(value: unknown, segments: readonly string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Maps validator issues on `document` to problems the builder can show.
 * One problem per control (the first issue wins), in document order.
 */
export function describeIssues<C extends SiteRenderContext>(
  document: unknown,
  issues: readonly ValidationIssue[],
  registry: Registry<C>,
): DocumentProblem[] {
  const root = valueAt(document, ["root"]);
  const sections = Array.isArray(root) ? (root as unknown[]) : [];
  const problems: DocumentProblem[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const segments = issue.path === "" ? [] : issue.path.split(".");
    if (segments[0] !== "root" || segments[1] === undefined || !/^\d+$/.test(segments[1])) {
      const key = `page:${issue.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        path: issue.path,
        sectionId: null,
        sectionIndex: null,
        section: null,
        field: null,
        fieldLabel: null,
        message: issue.message,
      });
      continue;
    }
    const index = Number(segments[1]);
    const node = sections[index] as { id?: unknown; type?: unknown; props?: unknown } | undefined;
    const type = typeof node?.type === "string" ? node.type : "";
    const definition = registry.get(type);
    const sectionId = typeof node?.id === "string" ? node.id : null;
    const section = definition?.section
      ? `Section ${String(index + 1)} · ${definition.label}`
      : `Section ${String(index + 1)}`;
    // Only a section's own props map to its settings; styles, nested nodes
    // and responsive overrides aren't edited in the builder's panel.
    const field =
      definition && segments[2] === "props" && segments.length > 3
        ? resolveField(definition.editorControls, segments.slice(3))
        : null;
    let message = issue.message;
    if (field?.link) {
      // A link to a record that hasn't been chosen yet ("Product" with no product).
      const target = valueAt(node?.props, field.key) as { type?: unknown; id?: unknown } | null;
      const kind = registry.linkKinds.find((k) => k.type === target?.type);
      if (
        kind?.idKind &&
        (typeof target?.id !== "string" || target.id === "" || segments.at(-1) === "id")
      ) {
        message = `Choose a ${kind.label.toLowerCase()}.`;
      }
    }
    const key = `${String(index)}:${field ? field.key.join(".") : issue.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push({
      path: issue.path,
      sectionId,
      sectionIndex: index,
      section,
      field: field ? field.key.join(".") : null,
      fieldLabel: field ? field.labels.join(" › ") : null,
      message,
    });
  }
  return problems;
}

export interface InputConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
}

interface Introspectable {
  readonly def?: { readonly type?: string };
  readonly shape?: Readonly<Record<string, unknown>>;
  readonly element?: unknown;
  readonly unwrap?: () => unknown;
  readonly minLength?: number | null;
  readonly maxLength?: number | null;
  readonly minValue?: number | null;
  readonly maxValue?: number | null;
}

const WRAPPERS = new Set(["optional", "nullable", "default", "prefault", "readonly", "catch"]);

/** A real limit (not unset, and not the safe-integer range `.int()` implies). */
const finite = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER;

/**
 * Limits for an input, read from a component's props schema at a control
 * key ("heading", "cta.label", "items.1.title"): the builder sets them as
 * maxLength/min/max so a value the server would refuse is hard to type.
 * Best effort: anything the schema doesn't say plainly gives no limit.
 */
export function inputConstraints(schema: unknown, key: string): InputConstraints {
  let current = schema as Introspectable | undefined;
  // Optional, nullable and default wrappers (not arrays, whose unwrap is the element).
  const unwrap = () => {
    for (
      let i = 0;
      i < 4 && current && WRAPPERS.has(current.def?.type ?? "") && current.unwrap;
      i++
    ) {
      current = current.unwrap() as Introspectable | undefined;
    }
  };
  for (const segment of key.split(".")) {
    unwrap();
    if (!current) return {};
    if (/^\d+$/.test(segment) && current.element !== undefined) {
      current = current.element as Introspectable;
    } else if (current.shape && segment in current.shape) {
      current = current.shape[segment] as Introspectable;
    } else {
      return {};
    }
  }
  unwrap();
  if (!current) return {};
  const out: { -readonly [K in keyof InputConstraints]: number } = {};
  if (finite(current.minLength) && current.minLength > 0) out.minLength = current.minLength;
  if (finite(current.maxLength)) out.maxLength = current.maxLength;
  if (finite(current.minValue)) out.min = current.minValue;
  if (finite(current.maxValue)) out.max = current.maxValue;
  return out;
}

/** One line for a problem: "Section 3 · Hero › Button › Button text: Enter at least 1 character." */
export function problemText(problem: DocumentProblem): string {
  const where = [problem.section, problem.fieldLabel].filter(Boolean).join(" › ");
  return where ? `${where}: ${problem.message}` : problem.message;
}

/** A summary of problems for one message ("… (and 2 more)"). */
export function problemsSummary(problems: readonly DocumentProblem[], max = 3): string {
  const first = problems.slice(0, max).map(problemText);
  const more = problems.length > max ? ` (and ${String(problems.length - max)} more)` : "";
  return `${first.join(" ")}${more}`;
}
