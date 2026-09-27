// Navigation menus (ADR-0030 §8): a store's header and footer menus are
// validated lists of labelled typed links, the same link model as page
// documents. A link that no longer resolves (a deleted page, an archived
// collection) renders as nothing. Flat in M5. Pure and client-safe.
import { z } from "zod";
import { plainText, type LinkTarget } from "./document/refs";
import { NODE_ID_RE } from "./document/types";

export const NAVIGATION_HANDLES = ["main", "footer"] as const;
export type NavigationHandle = (typeof NAVIGATION_HANDLES)[number];

export const NAVIGATION_LIMITS = { maxItems: 20, maxLabel: 80 } as const;

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly link: LinkTarget;
}

/** Items for a registry's link kinds: bounded, labelled, unique ids. */
export function navigationItemsSchema(linkSchema: z.ZodType<LinkTarget>) {
  return z
    .array(
      z.strictObject({
        id: z.string().regex(NODE_ID_RE, "Not an item id."),
        label: plainText(NAVIGATION_LIMITS.maxLabel)
          .transform((v) => v.trim())
          .refine((v) => v !== "", "Give the link a label."),
        link: linkSchema,
      }),
    )
    .max(
      NAVIGATION_LIMITS.maxItems,
      `A menu can have at most ${String(NAVIGATION_LIMITS.maxItems)} links.`,
    )
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, i) => {
        if (seen.has(item.id))
          ctx.addIssue({ code: "custom", path: [i, "id"], message: "Item ids must be unique." });
        seen.add(item.id);
      });
    });
}

/** Stored items the renderer can use: anything malformed is dropped, never rendered. */
export function usableNavigationItems(
  raw: unknown,
  linkSchema: z.ZodType<LinkTarget>,
): NavigationItem[] {
  const parsed = navigationItemsSchema(linkSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}
