// The page document v1 (docs/architecture/07-page-builder-document.md §2).
// The canonical, stored form is this nested tree of typed nodes; HTML is only
// ever a render output. Pure and client-safe.

export const DOCUMENT_SCHEMA_VERSION = 1;

export const PAGE_KINDS = [
  "HOME",
  "STANDARD",
  "PRODUCT_TEMPLATE",
  "COLLECTION_TEMPLATE",
  "SEARCH_TEMPLATE",
  "NOT_FOUND",
] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = Readonly<Record<string, JsonValue>>;

/** A theme token reference, e.g. `{ "$token": "color.primary" }`. */
export interface TokenRef {
  readonly $token: string;
}
export type StyleValue = TokenRef | string | number;

/** The closed style vocabulary (07 §4). Values are validated by `styleSetSchema`. */
export type StyleSet = Readonly<Record<string, StyleValue>>;

export interface ResponsiveOverride {
  readonly styles?: StyleSet;
  readonly props?: JsonObject;
}

export interface NodeVisibility {
  readonly desktop?: boolean;
  readonly tablet?: boolean;
  readonly mobile?: boolean;
}

export interface BuilderNode {
  /** 12 URL-safe characters, unique within the document. */
  readonly id: string;
  /** A registered component type, e.g. "section", "heading". */
  readonly type: string;
  readonly name?: string;
  readonly props: JsonObject;
  /** Base (desktop) styles. */
  readonly styles: StyleSet;
  /** Desktop-first overrides: tablet ≤ 1024 px, mobile ≤ 640 px. */
  readonly responsive?: {
    readonly tablet?: ResponsiveOverride;
    readonly mobile?: ResponsiveOverride;
  };
  readonly visibility?: NodeVisibility;
  /** Editor only: prevents selection and moves. */
  readonly locked?: boolean;
  /** Not rendered anywhere. */
  readonly hidden?: boolean;
  readonly children?: readonly BuilderNode[];
}

export interface PageDocument {
  readonly schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  /** Top-level sections. */
  readonly root: readonly BuilderNode[];
  readonly meta?: { readonly background?: StyleValue };
}

/** Hard limits (07 §7). */
export const DOCUMENT_LIMITS = {
  maxNodes: 2_000,
  maxDepth: 12,
  maxBytes: 1_048_576,
  maxDataBindings: 200,
} as const;

export const NODE_ID_RE = /^[A-Za-z0-9_-]{12}$/;
export const NODE_TYPE_RE = /^[a-z][a-z0-9-]{1,48}$/;
