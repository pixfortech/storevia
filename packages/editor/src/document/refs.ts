// Typed references (07-page-builder-document.md §3, ADR-0030 §3): links and
// media are never URLs built by the client. Link targets are a registered
// set of kinds: the Site Engine knows `url`, `home` and `page`; a
// composition adds its own (Storevia commerce adds product, collection,
// search and cart). A registry's schemas accept exactly its kinds. Ids are
// TypeIds of the right kind; external links are http(s), mailto or tel
// only. On save and publish the server checks every id belongs to the same
// store; at render time an id that doesn't resolve in the current store
// renders as nothing. Pure.
import { parseTypeId, type IdKind } from "@storevia/types";
import { z } from "zod";
import { isSafeHref, safeRichText, type RichTextDoc } from "../rich-text";

export { safeRichText };

/** A TypeId of one kind, as stored in documents (`page_…`, `media_…`, …). */
export const typeIdSchema = (kind: IdKind) =>
  z
    .string()
    .max(64)
    .refine((value) => parseTypeId(kind, value) !== null, `Not a ${kind} id.`);

const TEL_RE = /^tel:\+?[0-9() -]{3,32}$/;

/** http(s) and mailto (the rich-text rule), plus tel: for buttons. */
export function isSafeLinkHref(href: string): boolean {
  return TEL_RE.test(href) || isSafeHref(href);
}

/**
 * A link target. The Site Engine's own kinds are spelled out; a
 * composition's kinds are `{ type, id? }` objects its link kinds define.
 */
export type LinkTarget =
  | { readonly type: "url"; readonly href: string }
  | { readonly type: "home" }
  | { readonly type: "page"; readonly id: string }
  | { readonly type: string; readonly id?: string };

export interface LinkKindDefinition {
  readonly type: string;
  /** Shown in the link picker. */
  readonly label: string;
  /** A strict object schema for `{ type: <this type>, … }`. */
  readonly schema: z.ZodType<LinkTarget>;
  /** The TypeId kind of `id`, when the target names a record (checked on save). */
  readonly idKind?: IdKind;
}

export const SITE_LINK_KINDS: readonly LinkKindDefinition[] = [
  {
    type: "url",
    label: "Web address",
    schema: z.strictObject({
      type: z.literal("url"),
      href: z.string().max(2048).refine(isSafeLinkHref, "Unsafe link."),
    }),
  },
  { type: "home", label: "Home page", schema: z.strictObject({ type: z.literal("home") }) },
  {
    type: "page",
    label: "Page",
    idKind: "page",
    schema: z.strictObject({ type: z.literal("page"), id: typeIdSchema("page") }),
  },
];

/** One schema accepting exactly the given kinds. */
export function linkSchemaFor(kinds: readonly LinkKindDefinition[]): z.ZodType<LinkTarget> {
  const [first, second, ...rest] = kinds.map((k) => k.schema);
  if (!first) throw new Error("a registry needs at least one link kind");
  if (!second) return first;
  return z.union([first, second, ...rest]);
}

export const mediaRefSchema = z.strictObject({
  mediaId: typeIdSchema("media"),
  alt: z.string().max(512).optional(),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

export const richTextSchema = z.custom<RichTextDoc>(
  (value) => safeRichText(value) !== null,
  "Not a valid rich-text document.",
);

/** Plain text: bounded, no control characters except tab and newline. */
export const plainText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !hasControlCharacters(value), "Contains control characters.");

/** Control characters other than tab and newline. */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f) return true;
  }
  return false;
}

/**
 * Every typed link and media reference in a validated props value (for
 * batch resolution and the same-store check). `linkSchema` is the
 * registry's, so only its own kinds count as links.
 */
export function collectRefs(
  value: unknown,
  linkSchema: z.ZodType<LinkTarget>,
): { readonly links: LinkTarget[]; readonly media: string[] } {
  const links: LinkTarget[] = [];
  const media: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v !== "object" || v === null) return;
    // Rich text carries its own (URL-only) links and is never a reference.
    if ((v as { type?: unknown }).type === "doc") return;
    const link = linkSchema.safeParse(v);
    if (link.success) {
      links.push(link.data);
      return;
    }
    const ref = mediaRefSchema.safeParse(v);
    if (ref.success) {
      media.push(ref.data.mediaId);
      return;
    }
    for (const child of Object.values(v)) walk(child);
  };
  walk(value);
  return { links, media };
}
