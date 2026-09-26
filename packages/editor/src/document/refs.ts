// Typed references (07-page-builder-document.md §3): links, data sources and
// media are never URLs built by the client. Ids are TypeIds of the right
// kind; external links are http(s), mailto or tel only. On publish the server
// checks every id belongs to the same store (M5); at render time an id that
// doesn't resolve in the current store renders as nothing. Pure.
import { isSafeHref, safeRichText, type RichTextDoc } from "@storevia/commerce/rich-text";
import { parseTypeId } from "@storevia/types";
import { z } from "zod";

export { safeRichText };

const typeId = (kind: "product" | "collection" | "page" | "media") =>
  z
    .string()
    .max(64)
    .refine((value) => parseTypeId(kind, value) !== null, `Not a ${kind} id.`);

const TEL_RE = /^tel:\+?[0-9() -]{3,32}$/;

/** http(s) and mailto (the rich-text rule), plus tel: for buttons. */
export function isSafeLinkHref(href: string): boolean {
  return TEL_RE.test(href) || isSafeHref(href);
}

export const linkTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("url"),
    href: z.string().max(2048).refine(isSafeLinkHref, "Unsafe link."),
  }),
  z.strictObject({ type: z.literal("page"), id: typeId("page") }),
  z.strictObject({ type: z.literal("product"), id: typeId("product") }),
  z.strictObject({ type: z.literal("collection"), id: typeId("collection") }),
  z.strictObject({ type: z.literal("home") }),
  z.strictObject({ type: z.literal("search") }),
  z.strictObject({ type: z.literal("cart") }),
]);
export type LinkTarget = z.infer<typeof linkTargetSchema>;

export const dataSourceSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("collection"), id: typeId("collection") }),
  z.strictObject({ type: z.literal("products"), ids: z.array(typeId("product")).min(1).max(48) }),
  /** The store's newest active products (for default templates). */
  z.strictObject({ type: z.literal("catalogue") }),
]);
export type DataSource = z.infer<typeof dataSourceSchema>;

export const mediaRefSchema = z.strictObject({
  mediaId: typeId("media"),
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

/** Every typed link and media reference in a props value (for batch resolution). */
export function collectRefs(value: unknown): {
  readonly links: LinkTarget[];
  readonly media: string[];
} {
  const links: LinkTarget[] = [];
  const media: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v !== "object" || v === null) return;
    const link = linkTargetSchema.safeParse(v);
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
