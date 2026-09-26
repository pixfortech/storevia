// Server-side document validation (07-page-builder-document.md §7), run on
// every save and publish (M5) and on every document the storefront renders.
// Checks the envelope, the hard limits, unique node ids, that every type is
// registered and allowed where it sits and on this page kind, every node's
// props against its component schema, and every style against the closed
// vocabulary. Pure.
import { z } from "zod";
import type { Registry } from "../registry/types";
import { styleErrors, styleValueCss } from "./styles";
import {
  DOCUMENT_LIMITS,
  DOCUMENT_SCHEMA_VERSION,
  NODE_ID_RE,
  NODE_TYPE_RE,
  type BuilderNode,
  type JsonObject,
  type PageDocument,
  type PageKind,
  type StyleValue,
} from "./types";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | {
      readonly ok: true;
      readonly document: PageDocument;
      readonly nodeCount: number;
      readonly dataBindings: number;
      /** Entitlements the document's components need (checked on save/publish, M5). */
      readonly requiredFeatures: readonly string[];
    }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const jsonObject = z.record(z.string(), z.unknown());

const overrideSchema = z.strictObject({
  styles: jsonObject.optional(),
  props: jsonObject.optional(),
});

const nodeShape = z.strictObject({
  id: z.string().regex(NODE_ID_RE, "Node ids are 12 URL-safe characters."),
  type: z.string().regex(NODE_TYPE_RE, "Not a component type."),
  name: z.string().max(100).optional(),
  props: jsonObject,
  styles: jsonObject,
  responsive: z
    .strictObject({ tablet: overrideSchema.optional(), mobile: overrideSchema.optional() })
    .optional(),
  visibility: z
    .strictObject({
      desktop: z.boolean().optional(),
      tablet: z.boolean().optional(),
      mobile: z.boolean().optional(),
    })
    .optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  children: z.array(z.unknown()).optional(),
});

const envelope = z.strictObject({
  schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION),
  root: z.array(z.unknown()),
  meta: z.strictObject({ background: z.unknown().optional() }).optional(),
});

function byteLength(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return null;
  }
}

const zodIssues = (base: string, error: z.ZodError): ValidationIssue[] =>
  error.issues.map((issue) => ({
    path: [base, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }));

export interface ValidateOptions {
  readonly registry: Registry;
  readonly pageKind: PageKind;
}

export function validateDocument(input: unknown, options: ValidateOptions): ValidationResult {
  const issues: ValidationIssue[] = [];
  const bytes = byteLength(input);
  if (bytes === null || bytes > DOCUMENT_LIMITS.maxBytes) {
    return { ok: false, issues: [{ path: "", message: "The document is larger than 1 MiB." }] };
  }
  const parsed = envelope.safeParse(input);
  if (!parsed.success) return { ok: false, issues: zodIssues("", parsed.error) };
  const background = parsed.data.meta?.background;
  if (background !== undefined && styleValueCss("background", background as StyleValue) === null) {
    issues.push({ path: "meta.background", message: "Value not allowed." });
  }

  const ids = new Set<string>();
  const features = new Set<string>();
  let nodeCount = 0;
  let dataBindings = 0;

  const visit = (
    raw: unknown,
    path: string,
    depth: number,
    parentType: string | null,
  ): BuilderNode | null => {
    nodeCount += 1;
    if (nodeCount > DOCUMENT_LIMITS.maxNodes) return null;
    if (depth > DOCUMENT_LIMITS.maxDepth) {
      issues.push({
        path,
        message: `Nodes can be nested at most ${String(DOCUMENT_LIMITS.maxDepth)} deep.`,
      });
      return null;
    }
    const shape = nodeShape.safeParse(raw);
    if (!shape.success) {
      issues.push(...zodIssues(path, shape.error));
      return null;
    }
    const node = shape.data;
    if (ids.has(node.id)) issues.push({ path: `${path}.id`, message: "Node ids must be unique." });
    ids.add(node.id);

    const definition = options.registry.get(node.type);
    if (!definition) {
      issues.push({ path: `${path}.type`, message: `Unknown component "${node.type}".` });
      return null;
    }
    if (definition.allowedPageKinds && !definition.allowedPageKinds.includes(options.pageKind)) {
      issues.push({
        path: `${path}.type`,
        message: `"${node.type}" can't be used on this kind of page.`,
      });
    }
    if (
      definition.allowedParents &&
      (parentType === null || !definition.allowedParents.includes(parentType))
    ) {
      issues.push({
        path: `${path}.type`,
        message: `"${node.type}" must be inside ${definition.allowedParents.join(" or ")}.`,
      });
    }
    if (parentType !== null) {
      const parent = options.registry.get(parentType);
      const allowed = parent?.allowedChildren ?? "none";
      if (allowed === "none" || (allowed !== "any" && !allowed.includes(node.type))) {
        issues.push({
          path: `${path}.type`,
          message: `"${parentType}" can't contain "${node.type}".`,
        });
      }
    }
    if (definition.entitlement) features.add(definition.entitlement);

    const props = { ...definition.defaultProps, ...node.props };
    const checked = definition.propertySchema.safeParse(props);
    if (!checked.success) issues.push(...zodIssues(`${path}.props`, checked.error));
    else dataBindings += definition.dataRequirements?.(checked.data).length ?? 0;

    for (const [property, message] of Object.entries(styleErrors(node.styles))) {
      issues.push({ path: `${path}.styles.${property}`, message });
    }
    for (const breakpoint of ["tablet", "mobile"] as const) {
      const override = node.responsive?.[breakpoint];
      if (!override) continue;
      for (const [property, message] of Object.entries(styleErrors(override.styles ?? {}))) {
        issues.push({ path: `${path}.responsive.${breakpoint}.styles.${property}`, message });
      }
      if (override.props) {
        const merged = definition.propertySchema.safeParse({ ...props, ...override.props });
        if (!merged.success)
          issues.push(...zodIssues(`${path}.responsive.${breakpoint}.props`, merged.error));
      }
    }

    const children: BuilderNode[] = [];
    if (node.children && node.children.length > 0 && definition.allowedChildren === "none") {
      issues.push({ path: `${path}.children`, message: `"${node.type}" can't have children.` });
    } else {
      for (const [i, child] of (node.children ?? []).entries()) {
        const visited = visit(child, `${path}.children.${String(i)}`, depth + 1, node.type);
        if (visited) children.push(visited);
      }
    }
    return {
      ...node,
      props: node.props as JsonObject,
      styles: node.styles as BuilderNode["styles"],
      children,
    } as BuilderNode;
  };

  const root: BuilderNode[] = [];
  for (const [i, raw] of parsed.data.root.entries()) {
    const node = visit(raw, `root.${String(i)}`, 1, null);
    if (node) root.push(node);
  }
  if (nodeCount > DOCUMENT_LIMITS.maxNodes) {
    issues.push({
      path: "root",
      message: `A page can have at most ${String(DOCUMENT_LIMITS.maxNodes)} nodes.`,
    });
  }
  if (dataBindings > DOCUMENT_LIMITS.maxDataBindings) {
    issues.push({
      path: "root",
      message: `A page can have at most ${String(DOCUMENT_LIMITS.maxDataBindings)} data bindings.`,
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    document: input as PageDocument,
    nodeCount,
    dataBindings,
    requiredFeatures: [...features].sort(),
  };
}

/**
 * Brings a stored document to the current schema version (07 §7). Version 1
 * is the only version so far; the migration framework arrives with M5-01.
 * Published documents are upgraded in memory only, never rewritten.
 */
export function upgradeDocument(input: unknown): unknown {
  if (
    typeof input === "object" &&
    input !== null &&
    (input as { schemaVersion?: unknown }).schemaVersion === 1
  ) {
    return input;
  }
  return null;
}
