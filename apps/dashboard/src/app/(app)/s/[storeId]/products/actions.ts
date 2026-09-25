"use server";

import {
  archiveProduct,
  attachProductMedia,
  bulkProductAction,
  changeProductOptions,
  createProduct,
  detachProductMedia,
  reorderProductMedia,
  restoreProduct,
  searchProducts,
  setProductMediaAlt,
  setProductStatus,
  updateProduct,
  updateVariants,
  type BulkResult,
  type OptionChangeResult,
} from "@storevia/commerce";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, runDataAction, type ActionState, type DataActionResult } from "@/lib/action";
import { productPath, productsPath } from "@/lib/catalogue";
import { storeActionContext } from "@/lib/store-action";

// Product server actions. `storeId` and `productId` are bound on the client
// and re-checked on every call: the store context comes from the session's
// membership, and the product id is resolved inside that store's RLS scope.

const text = (formData: FormData, name: string): string | undefined => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};
const bool = (formData: FormData, name: string): boolean | undefined =>
  formData.has(name) ? formData.get(name) === "on" || formData.get(name) === "true" : undefined;

function refresh(storeId: string, productId?: string) {
  revalidatePath(productsPath(storeId), "layout");
  if (productId) revalidatePath(productPath(storeId, productId));
}

export async function createProductAction(
  storeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let created: { storeId: string; productId: string } | undefined;
  const state = await runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const stock = text(formData, "initialStock");
    const { productId } = await createProduct(ctx, {
      title: text(formData, "title") ?? "",
      description: text(formData, "description"),
      status: text(formData, "status") === "ACTIVE" ? "ACTIVE" : "DRAFT",
      price: text(formData, "price") ?? "",
      compareAtPrice: text(formData, "compareAtPrice") ?? "",
      sku: text(formData, "sku") ?? "",
      barcode: text(formData, "barcode") ?? "",
      vendor: text(formData, "vendor") ?? "",
      productType: text(formData, "productType") ?? "",
      trackInventory: bool(formData, "trackInventory") ?? false,
      ...(stock && stock.trim() !== "" ? { initialStock: stock } : {}),
    });
    created = { storeId: ctx.storeId, productId };
    return { ok: true };
  }, formData);
  if (!state.ok || !created) return state;
  refresh(created.storeId);
  redirect(`${productPath(created.storeId, created.productId)}?created=1`);
}

export async function updateProductAction(
  storeId: string,
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { updatedAt } = await updateProduct(ctx, productId, {
      title: text(formData, "title"),
      handle: text(formData, "handle"),
      description: text(formData, "description"),
      vendor: text(formData, "vendor"),
      productType: text(formData, "productType"),
      tags: text(formData, "tags") ?? "",
      seoTitle: text(formData, "seoTitle"),
      seoDescription: text(formData, "seoDescription"),
      expectedUpdatedAt: text(formData, "expectedUpdatedAt"),
    });
    refresh(ctx.storeId, productId);
    return {
      ok: true,
      message: "Product saved.",
      values: { expectedUpdatedAt: updatedAt.toISOString() },
    };
  }, formData);
}

export async function setProductStatusAction(
  storeId: string,
  productId: string,
  status: "ACTIVE" | "DRAFT",
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { updatedAt } = await setProductStatus(ctx, productId, status);
    refresh(ctx.storeId, productId);
    return {
      ok: true,
      message: status === "ACTIVE" ? "Product is active." : "Product is a draft again.",
      values: { updatedAt: updatedAt.toISOString() },
    };
  });
}

export async function archiveProductAction(
  storeId: string,
  productId: string,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await archiveProduct(ctx, productId);
    refresh(ctx.storeId, productId);
    return { ok: true, message: "Product archived. It no longer counts against your plan." };
  });
}

export async function restoreProductAction(
  storeId: string,
  productId: string,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await restoreProduct(ctx, productId);
    refresh(ctx.storeId, productId);
    return { ok: true, message: "Product restored as a draft." };
  });
}

export async function bulkProductsAction(
  storeId: string,
  input: unknown,
): Promise<DataActionResult<BulkResult>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result = await bulkProductAction(ctx, input);
    refresh(ctx.storeId);
    return result;
  });
}

export async function changeOptionsAction(
  storeId: string,
  productId: string,
  input: unknown,
): Promise<DataActionResult<OptionChangeResult>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result = await changeProductOptions(ctx, productId, input);
    if (result.status === "applied") refresh(ctx.storeId, productId);
    return result;
  });
}

export async function updateVariantsAction(
  storeId: string,
  productId: string,
  input: unknown,
): Promise<DataActionResult<{ updated: number; updatedAt: string }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { updated, updatedAt } = await updateVariants(ctx, productId, input);
    refresh(ctx.storeId, productId);
    return { updated, updatedAt: updatedAt.toISOString() };
  }, "Variants saved.");
}

export async function attachMediaAction(
  storeId: string,
  productId: string,
  mediaIds: string[],
): Promise<DataActionResult<{ attached: number; updatedAt: string }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result = await attachProductMedia(ctx, productId, { mediaIds });
    refresh(ctx.storeId, productId);
    return { attached: result.attached, updatedAt: result.updatedAt.toISOString() };
  });
}

export async function reorderMediaAction(
  storeId: string,
  productId: string,
  mediaIds: string[],
): Promise<DataActionResult<{ updatedAt: string }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { updatedAt } = await reorderProductMedia(ctx, productId, { mediaIds });
    refresh(ctx.storeId, productId);
    return { updatedAt: updatedAt.toISOString() };
  });
}

export async function detachMediaAction(
  storeId: string,
  productId: string,
  mediaId: string,
): Promise<DataActionResult<{ updatedAt: string }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { updatedAt } = await detachProductMedia(ctx, productId, mediaId);
    refresh(ctx.storeId, productId);
    return { updatedAt: updatedAt.toISOString() };
  });
}

export async function setMediaAltAction(
  storeId: string,
  productId: string,
  mediaId: string,
  altText: string,
): Promise<DataActionResult<{ updatedAt: string }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { updatedAt } = await setProductMediaAlt(ctx, productId, mediaId, { altText });
    refresh(ctx.storeId, productId);
    return { updatedAt: updatedAt.toISOString() };
  });
}

/** Product search for pickers (collections): titles and ids only. */
export async function searchProductsAction(
  storeId: string,
  q: string,
): Promise<DataActionResult<{ id: string; title: string; status: string }[]>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const items = await searchProducts(ctx, q, { limit: 20 });
    return items.map((i) => ({ id: i.id, title: i.title, status: i.status }));
  });
}
