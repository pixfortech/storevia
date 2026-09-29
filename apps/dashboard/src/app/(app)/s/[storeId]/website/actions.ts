"use server";

import { listCollections, searchProducts } from "@storevia/commerce";
import type { DocumentData } from "@storevia/commerce/blocks";
import { STOREVIA_SITE } from "@storevia/commerce/site";
import { loadCanvasData } from "@storevia/commerce/storefront";
import { listMedia, type MediaView } from "@storevia/media";
import {
  createPage,
  deletePage,
  publishPage,
  revertPageDraft,
  saveMenu,
  savePageDraft,
  setStoreBrandImage,
  unpublishPage,
  updatePageSettings,
  type MenuView,
  type PageStatus,
  type PublishResult,
  type RevertResult,
} from "@storevia/site-admin";
import { hasPermission } from "@storevia/tenancy";
import { revalidatePath } from "next/cache";
import { runDataAction, type DataActionResult } from "@/lib/action";
import { dashboardMediaUrl, dashboardSrcSet, pagesPath, websitePath } from "@/lib/site";
import { storeActionContext } from "@/lib/store-action";

// Website actions (ADR-0030). Every call re-derives the store context from
// the session (the storeId argument is only a request), and the services
// check permissions, validate and scope everything themselves: the UI hiding
// a button is never the only guard.

export async function createPageAction(
  storeId: string,
  input: { title: string; handle?: string },
): Promise<DataActionResult<{ pageId: string }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result = await createPage(ctx, input);
    revalidatePath(pagesPath(ctx.storeId));
    return result;
  }, "Page created.");
}

export async function savePageDraftAction(
  storeId: string,
  pageId: string,
  input: { revision: number; document: unknown },
): Promise<DataActionResult<{ revision: number; status: PageStatus }>> {
  return runDataAction(async () =>
    savePageDraft(await storeActionContext(storeId), pageId, input, STOREVIA_SITE),
  );
}

export async function publishPageAction(
  storeId: string,
  pageId: string,
  input: { revision: number },
): Promise<DataActionResult<PublishResult>> {
  const result = await runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const published = await publishPage(ctx, pageId, input, STOREVIA_SITE);
    if (published.changed) revalidatePath(pagesPath(ctx.storeId));
    return published;
  });
  if (!result.ok) return result;
  return {
    ...result,
    message: result.data.changed
      ? "Published. Your site shows these changes now."
      : "Nothing new to publish: your site already shows this page.",
  };
}

/** Throws away the draft's unpublished changes (the live page doesn't change). */
export async function revertPageDraftAction(
  storeId: string,
  pageId: string,
  input: { revision: number },
): Promise<DataActionResult<RevertResult>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result = await revertPageDraft(ctx, pageId, input, STOREVIA_SITE);
    revalidatePath(pagesPath(ctx.storeId));
    return result;
  }, "Your draft is back to the published version.");
}

export async function updatePageSettingsAction(
  storeId: string,
  pageId: string,
  input: { title: string; handle: string; seoTitle: string; seoDescription: string },
): Promise<DataActionResult<null>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    await updatePageSettings(ctx, pageId, input);
    revalidatePath(pagesPath(ctx.storeId));
    return null;
  }, "Page settings saved.");
}

export async function unpublishPageAction(
  storeId: string,
  pageId: string,
): Promise<DataActionResult<null>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    await unpublishPage(ctx, pageId);
    revalidatePath(pagesPath(ctx.storeId));
    return null;
  }, "Unpublished. The page is no longer on your site.");
}

export async function deletePageAction(
  storeId: string,
  pageId: string,
): Promise<DataActionResult<null>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    await deletePage(ctx, pageId);
    revalidatePath(pagesPath(ctx.storeId));
    return null;
  }, "Page deleted.");
}

/**
 * Media and catalogue data for the builder canvas, resolved like the
 * storefront does. The document comes from the browser: only its sections
 * that validate are resolved (loadCanvasData).
 */
export async function canvasDataAction(
  storeId: string,
  kind: unknown,
  document: unknown,
): Promise<DataActionResult<DocumentData>> {
  return runDataAction(async () => {
    const data = await loadCanvasData(
      await storeActionContext(storeId),
      document,
      kind === "HOME" ? "HOME" : "STANDARD",
    );
    const image = <T extends { url: string; srcSet: string }>(view: T): T => ({
      ...view,
      url: dashboardMediaUrl(view.url),
      srcSet: dashboardSrcSet(view.srcSet),
    });
    const card = <T extends { image: { url: string; srcSet: string } | null }>(item: T): T => ({
      ...item,
      image: item.image ? image(item.image) : null,
    });
    return {
      ...data,
      media: data.media.map(([id, view]) => [id, image(view)] as const),
      productLists: data.productLists.map(([key, items]) => [key, items.map(card)] as const),
      collectionLists: data.collectionLists.map(([key, items]) => [key, items.map(card)] as const),
    };
  });
}

export interface PickerOption {
  readonly id: string;
  readonly title: string;
}

export async function searchProductsAction(
  storeId: string,
  q: string,
): Promise<DataActionResult<PickerOption[]>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    if (!hasPermission(ctx, "product.read")) return [];
    const items = await searchProducts(ctx, q.slice(0, 100), { limit: 20 });
    return items.map((p) => ({ id: p.id, title: p.title }));
  });
}

export async function collectionOptionsAction(
  storeId: string,
): Promise<DataActionResult<PickerOption[]>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    if (!hasPermission(ctx, "collection.read")) return [];
    const items = await listCollections(ctx);
    return items.map((c) => ({ id: c.id, title: c.title }));
  });
}

export interface PickerImage {
  readonly id: string;
  readonly filename: string;
  readonly alt: string;
  readonly src: string;
}

export async function mediaOptionsAction(
  storeId: string,
  q: string,
): Promise<DataActionResult<PickerImage[]>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const page = await listMedia(ctx, { q: q.slice(0, 100) || undefined, limit: 48 });
    return page.items.flatMap((m: MediaView) =>
      m.thumbnailUrl
        ? [
            {
              id: m.id,
              filename: m.filename,
              alt: m.altText ?? "",
              src: dashboardMediaUrl(m.thumbnailUrl),
            },
          ]
        : [],
    );
  });
}

export async function saveMenuAction(
  storeId: string,
  handle: string,
  input: { revision: number; items: unknown },
): Promise<DataActionResult<MenuView>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    return saveMenu(ctx, handle, input, STOREVIA_SITE);
  }, "Menu saved. Your site shows it now.");
}

const BRAND_MESSAGES = {
  logo: {
    set: "Logo saved. Your site's header shows it now.",
    removed: "Logo removed. Your site's header shows your store's name.",
  },
  favicon: {
    set: "Favicon saved. Your site's pages use it now.",
    removed: "Favicon removed. Browsers show their default icon.",
  },
} as const;

/**
 * Sets or removes the store's logo or favicon. The media id is only a
 * request: the service checks it is a READY image in this store.
 */
export async function setBrandImageAction(
  storeId: string,
  input: { slot: "logo" | "favicon"; mediaId: string | null },
): Promise<DataActionResult<null>> {
  const slot = input.slot === "favicon" ? "favicon" : "logo";
  return runDataAction(
    async () => {
      const ctx = await storeActionContext(storeId);
      await setStoreBrandImage(ctx, input);
      revalidatePath(websitePath(ctx.storeId, "/brand"));
      return null;
    },
    BRAND_MESSAGES[slot][input.mediaId === null ? "removed" : "set"],
  );
}
