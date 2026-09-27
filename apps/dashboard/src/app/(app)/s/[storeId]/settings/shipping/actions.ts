"use server";

import {
  createShippingRate,
  createShippingZone,
  deleteShippingRate,
  deleteShippingZone,
  updateShippingRate,
  updateShippingZone,
} from "@storevia/commerce";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { settingsPath } from "@/lib/settings-tabs";
import { storeActionContext } from "@/lib/store-action";

// Shipping zones and rates (ADR-0031 §7). The commerce service checks
// `settings.manage` and validates every field; ids arrive from the client
// and are resolved inside the store's own scope.

const refresh = (storeId: string) => {
  revalidatePath(settingsPath(storeId, "/shipping"));
};

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function saveShippingZoneAction(
  storeId: string,
  zoneId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const input = {
      name: text(formData, "name"),
      countries: text(formData, "countries"),
      regions: text(formData, "regions"),
    };
    if (zoneId) await updateShippingZone(ctx, zoneId, input);
    else await createShippingZone(ctx, input);
    refresh(ctx.storeId);
    return { ok: true, message: zoneId ? "Zone saved." : "Zone added." };
  }, formData);
}

export async function deleteShippingZoneAction(
  storeId: string,
  zoneId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await deleteShippingZone(ctx, zoneId);
    refresh(ctx.storeId);
    return { ok: true, message: "Zone deleted." };
  });
}

export async function saveShippingRateAction(
  storeId: string,
  zoneId: string,
  rateId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const input = {
      name: text(formData, "name"),
      type: text(formData, "type"),
      amount: text(formData, "amount"),
      minSubtotal: text(formData, "minSubtotal"),
      maxSubtotal: text(formData, "maxSubtotal"),
      // Always sent by the form ("on" or "off"): a missing value would mean "active".
      active: text(formData, "active") === "on",
    };
    if (rateId) await updateShippingRate(ctx, rateId, input);
    else await createShippingRate(ctx, zoneId, input);
    refresh(ctx.storeId);
    return { ok: true, message: rateId ? "Rate saved." : "Rate added." };
  }, formData);
}

export async function deleteShippingRateAction(
  storeId: string,
  rateId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await deleteShippingRate(ctx, rateId);
    refresh(ctx.storeId);
    return { ok: true, message: "Rate deleted." };
  });
}
