import "server-only";
import type { TenantTx } from "@storevia/database";
import { collectRefs, type LinkTarget, type PageDocument } from "@storevia/editor/document";
import type { SiteRenderContext } from "@storevia/editor/registry";
import { parseTypeId } from "@storevia/types";
import type { SiteComposition } from "./composition";

// Same-store reference checks (ADR-0030 §5, threat: IDOR through ids in a
// document). Runs inside the save or publish transaction, under the
// store's RLS scope: another store's ids simply don't exist here. Media must
// be READY (processed); pages must not be deleted.

const uuids = (kind: "media" | "page", ids: readonly string[]) => [
  ...new Set(ids.map((id) => parseTypeId(kind, id)).filter((id): id is string => id !== null)),
];

export async function missingReferences<C extends SiteRenderContext>(
  tx: TenantTx,
  composition: SiteComposition<C>,
  refs: {
    readonly links: readonly LinkTarget[];
    readonly media: readonly string[];
    readonly values: readonly unknown[];
  },
  selfPageId?: string,
): Promise<string[]> {
  const problems: string[] = [];
  const media = uuids("media", refs.media);
  if (media.length > 0) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "MediaAsset" WHERE id = ANY(${media}::uuid[]) AND status = 'READY' AND "deletedAt" IS NULL`;
    if (rows.length !== media.length) problems.push("An image is no longer in your media library.");
  }
  const pages = uuids(
    "page",
    refs.links.flatMap((l) =>
      l.type === "page" && "id" in l && typeof l.id === "string" ? [l.id] : [],
    ),
  ).filter((id) => id !== selfPageId);
  if (pages.length > 0) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Page" WHERE id = ANY(${pages}::uuid[]) AND "deletedAt" IS NULL`;
    if (rows.length !== pages.length) problems.push("A link points to a page that doesn't exist.");
  }
  if (composition.checkReferences) {
    problems.push(
      ...(await composition.checkReferences(tx, { links: refs.links, values: refs.values })),
    );
  }
  return problems;
}

/** Every reference in a validated document, hidden sections included (they can be shown again). */
export function documentReferences<C extends SiteRenderContext>(
  document: PageDocument,
  composition: SiteComposition<C>,
) {
  const links: LinkTarget[] = [];
  const media: string[] = [];
  const values: unknown[] = [];
  const walk = (nodes: PageDocument["root"]): void => {
    for (const node of nodes) {
      const definition = composition.registry.get(node.type);
      const parsed = definition?.propertySchema.safeParse({
        ...definition.defaultProps,
        ...node.props,
      });
      const props = parsed?.success ? parsed.data : node.props;
      const refs = collectRefs(props, composition.registry.linkSchema);
      links.push(...refs.links);
      media.push(...refs.media);
      values.push(props);
      walk(node.children ?? []);
    }
  };
  walk(document.root);
  return { links, media, values };
}

/** Every reference in validated menu items. */
export function menuReferences<C extends SiteRenderContext>(
  items: readonly { readonly link: LinkTarget }[],
  composition: SiteComposition<C>,
) {
  const refs = collectRefs(
    items.map((i) => i.link),
    composition.registry.linkSchema,
  );
  return { links: refs.links, media: refs.media, values: items.map((i) => i.link) };
}
