"use server";

import {
  adjustInventory,
  createLocation,
  moveInventory,
  setInventory,
  setInventoryTracking,
  setLocationActive,
  updateLocation,
} from "@storevia/commerce";
import { revalidatePath } from "next/cache";
import { runAction, runDataAction, type ActionState, type DataActionResult } from "@/lib/action";
import { inventoryPath, productsPath } from "@/lib/catalogue";
import { storeActionContext } from "@/lib/store-action";

// Inventory and location actions: every stock change goes through the
// commerce inventory service (locked rows, conditional updates, ledger).

function refresh(storeId: string) {
  revalidatePath(inventoryPath(storeId), "layout");
  revalidatePath(productsPath(storeId), "layout");
}

export async function adjustStockAction(
  storeId: string,
  input: {
    mode: "adjust" | "set";
    variantId: string;
    locationId: string;
    quantity: string;
    reason: string;
    note: string;
  },
): Promise<DataActionResult<{ available: number }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const result =
      input.mode === "set"
        ? await setInventory(ctx, {
            variantId: input.variantId,
            locationId: input.locationId,
            quantity: input.quantity,
            reason: input.reason,
            note: input.note,
          })
        : await adjustInventory(ctx, {
            variantId: input.variantId,
            locationId: input.locationId,
            delta: input.quantity,
            reason: input.reason,
            note: input.note,
          });
    refresh(ctx.storeId);
    return { available: result.available };
  }, "Stock updated.");
}

export async function moveStockAction(
  storeId: string,
  input: {
    variantId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: string;
    note: string;
  },
): Promise<DataActionResult<null>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    await moveInventory(ctx, input);
    refresh(ctx.storeId);
    return null;
  }, "Stock moved.");
}

export async function setTrackingAction(
  storeId: string,
  variantId: string,
  tracked: boolean,
): Promise<DataActionResult<null>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    await setInventoryTracking(ctx, variantId, tracked);
    refresh(ctx.storeId);
    return null;
  });
}

const locationInput = (formData: FormData) => ({
  name: formData.get("name") ?? "",
  code: formData.get("code") ?? "",
  addressLine1: formData.get("addressLine1") ?? "",
  addressLine2: formData.get("addressLine2") ?? "",
  city: formData.get("city") ?? "",
  region: formData.get("region") ?? "",
  postalCode: formData.get("postalCode") ?? "",
  countryCode: formData.get("countryCode") ?? "",
  phone: formData.get("phone") ?? "",
  fulfilsOnlineOrders: formData.get("fulfilsOnlineOrders") === "on",
});

export async function saveLocationAction(
  storeId: string,
  locationId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    if (locationId) await updateLocation(ctx, locationId, locationInput(formData));
    else await createLocation(ctx, locationInput(formData));
    refresh(ctx.storeId);
    return { ok: true, message: locationId ? "Location saved." : "Location added." };
  }, formData);
}

export async function setLocationActiveAction(
  storeId: string,
  locationId: string,
  active: boolean,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await setLocationActive(ctx, locationId, active);
    refresh(ctx.storeId);
    return { ok: true, message: active ? "Location activated." : "Location deactivated." };
  });
}
