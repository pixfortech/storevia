// The component registry contract (07-page-builder-document.md §5, ADR-0030
// §3). Components are registered, not hard-coded into the editor or
// renderer: each declares its props schema, where it may appear, what data
// it needs (collected once per page and resolved in batch), the controls the
// builder shows for it, and a server renderer shared by the public site and
// the builder canvas. Registries are built at compile time from first-party
// modules; there is no runtime registration.
//
// This module is generic (the Site Engine's). A composition extends the
// render context with its own data (Storevia commerce: product lists, the
// current product, the cart form) and registers its own components and link
// kinds on top.
import type { ReactNode } from "react";
import type { z } from "zod";
import type { LinkKindDefinition, LinkTarget, MediaRef } from "../document/refs";
import type { BuilderNode, PageKind } from "../document/types";

// ---------------------------------------------------------------------------
// Data requests: what a page needs, gathered before rendering (06 §4). The
// engine treats them as opaque; the composition that registered the
// component resolves them.
// ---------------------------------------------------------------------------

export interface DataRequest {
  readonly kind: string;
  readonly [key: string]: unknown;
}

/** A stable key per request, so identical requests resolve once. */
export function dataRequestKey(request: DataRequest): string {
  return JSON.stringify(request);
}

// ---------------------------------------------------------------------------
// Views and render context.
// ---------------------------------------------------------------------------

export interface ImageView {
  readonly url: string;
  /** `url 320w, url 640w, …` */
  readonly srcSet: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string;
}

/** Resolved references for one render. Anything unresolved reads as null. */
export interface SiteRenderData {
  /** The href for a typed link on this site, or null when it doesn't resolve. */
  link(target: LinkTarget): string | null;
  image(ref: MediaRef): ImageView | null;
}

export interface SiteRenderContext {
  readonly pageKind: PageKind;
  readonly site: { readonly name: string; readonly locale: string };
  readonly data: SiteRenderData;
  /** Unknown component types are skipped and reported here (07 §7). */
  onUnknownComponent?(type: string): void;
  /** Stored props that no longer validate are skipped and reported here. */
  onInvalidComponent?(type: string): void;
}

// ---------------------------------------------------------------------------
// Component definitions.
// ---------------------------------------------------------------------------

export type ComponentCategory =
  "layout" | "basic" | "media" | "text" | "marketing" | "commerce" | "advanced";

/** A declarative settings control; the builder renders it, so a new component needs no builder change. */
export interface PropertyControl {
  readonly prop: string;
  readonly kind:
    | "text"
    | "textarea"
    | "richtext"
    | "media"
    | "link"
    | "action"
    | "select"
    | "toggle"
    | "number"
    | "email"
    | "items"
    | "collections"
    | "product-source";
  readonly label: string;
  readonly help?: string;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly min?: number;
  readonly max?: number;
  /** For `items`: the controls of one item, its default value and the most allowed. */
  readonly fields?: readonly PropertyControl[];
  readonly itemDefaults?: Readonly<Record<string, unknown>>;
  readonly maxItems?: number;
  /** For `items`: which field names an item in the list ("title", "question"…). */
  readonly itemLabel?: string;
}

export interface RenderArgs<P, C extends SiteRenderContext = SiteRenderContext> {
  readonly node: BuilderNode;
  readonly props: P;
  /** `n-{id}`: the node's scoped class for its compiled styles. */
  readonly className: string;
  readonly children: ReactNode;
  readonly ctx: C;
  /** Position among the page's sections, or null for a nested node. The first section owns the page's h1. */
  readonly position: number | null;
}

export interface ComponentDefinition<
  P extends object = Record<string, unknown>,
  C extends SiteRenderContext = SiteRenderContext,
> {
  readonly type: string;
  readonly label: string;
  /** One line for the builder's block picker. */
  readonly description?: string;
  readonly icon: string;
  readonly category: ComponentCategory;
  /** A section block: the builder offers it as a top-level section (ADR-0030 §1). */
  readonly section?: boolean;
  /** The prop holding the section's main heading, if any (the page's h1 when first). */
  readonly headingProp?: string;
  /** Data the store must have for the block to be useful (e.g. "catalogue"); the builder hides it otherwise. */
  readonly requires?: readonly string[];
  /** Inferred from the schema, never from the defaults. */
  readonly defaultProps: NoInfer<P>;
  readonly propertySchema: z.ZodType<P>;
  readonly allowedChildren: "none" | "any" | readonly string[];
  readonly allowedParents?: readonly string[];
  readonly allowedPageKinds?: readonly PageKind[];
  /** Data this node needs, gathered once per page before rendering. */
  readonly dataRequirements?: (props: P) => readonly DataRequest[];
  /** Custom properties for the node's scoped rule, e.g. `{ "--sv-columns": "4" }` (base and responsive props). */
  readonly cssVariables?: (props: Partial<P>) => Readonly<Record<string, string>>;
  /** Entitlement a document using this component needs (checked on save and publish). */
  readonly entitlement?: string;
  readonly editorControls: readonly PropertyControl[];
  readonly render: (args: RenderArgs<P, C>) => ReactNode;
}

/** A definition whose schemas depend on the registry's link kinds. */
export type ComponentFactory<C extends SiteRenderContext = SiteRenderContext> = (
  kit: SchemaKit,
) => ComponentDefinition<object, C>;

/** Schemas a factory builds its props from; `link` accepts exactly the registry's link kinds. */
export interface SchemaKit {
  readonly link: z.ZodType<LinkTarget>;
}

export interface Registry<C extends SiteRenderContext = SiteRenderContext> {
  get(type: string): ComponentDefinition<object, C> | undefined;
  readonly types: readonly string[];
  /** Section blocks, in registration order. */
  readonly sections: readonly ComponentDefinition<object, C>[];
  readonly linkKinds: readonly LinkKindDefinition[];
  readonly linkSchema: z.ZodType<LinkTarget>;
}
