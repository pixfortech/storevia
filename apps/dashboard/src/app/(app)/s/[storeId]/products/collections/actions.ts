"use server";

import {
  addProductsToCollection,
  createCollection,
  removeProductsFromCollection,
  reorderCollectionProducts,
  setCollectionArchived,
  updateCollection,
} from "@storevia/commerce";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, runDataAction, type ActionState, type DataActionResult } from "@/lib/action";
import { collectionsPath, productsPath } from "@/lib/catalogue";
import { storeActionContext } from "@/lib/store-action";

// Collection actions (manual collections). Product ids are resolved inside
// the store's RLS scope, so another store's products can't be linked.

function refresh(storeId: string) {
  revalidatePath(productsPath(storeId), "layout");
}

const collectionInput = (formData: FormData) => ({
  title: formData.get("title") ?? "",
  handle: formData.get("handle") ?? "",
  description: formData.get("description") ?? undefined,
  seoTitle: formData.get("seoTitle") ?? "",
  seoDescription: formData.get("seoDescription") ?? "",
});

export async function createCollectionAction(
  storeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let target: string | undefined;
  const state = await runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { collectionId } = await createCollection(ctx, {
      title: formData.get("title") ?? "",
      handle: formData.get("handle") ?? "",
    });
    refresh(ctx.storeId);
    target = collectionsPath(ctx.storeId, `/${collectionId}`);
    return { ok: true };
  }, formData);
  if (!state.ok || !target) return state;
  redirect(target);
}

export async function updateCollectionAction(
  storeId: string,
  collectionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await updateCollection(ctx, collectionId, collectionInput(formData));
    refresh(ctx.storeId);
    return { ok: true, message: "Collection saved." };
  }, formData);
}

export async function setCollectionArchivedAction(
  storeId: string,
  collectionId: string,
  archived: boolean,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await setCollectionArchived(ctx, collectionId, archived);
    refresh(ctx.storeId);
    return { ok: true, message: archived ? "Collection archived." : "Collection restored." };
  });
}

export async function addToCollectionAction(
  storeId: string,
  collectionId: string,
  productIds: string[],
): Promise<DataActionResult<{ added: number }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { added } = await addProductsToCollection(ctx, collectionId, { productIds });
    refresh(ctx.storeId);
    return { added };
  });
}

export async function removeFromCollectionAction(
  storeId: string,
  collectionId: string,
  productIds: string[],
): Promise<DataActionResult<{ removed: number }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result = await removeProductsFromCollection(ctx, collectionId, { productIds });
    refresh(ctx.storeId);
    return result;
  });
}

export async function reorderCollectionAction(
  storeId: string,
  collectionId: string,
  productIds: string[],
): Promise<DataActionResult<null>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    await reorderCollectionProducts(ctx, collectionId, { productIds });
    refresh(ctx.storeId);
    return null;
  });
}
