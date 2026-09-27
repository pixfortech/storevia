"use server";

import { createTaxRate, deleteTaxRate, updateTaxRate, updateTaxSettings } from "@storevia/commerce";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { settingsPath } from "@/lib/settings-tabs";
import { storeActionContext } from "@/lib/store-action";

// Manual tax settings (ADR-0031 §7): the commerce service checks
// `settings.manage` and validates every field.

const refresh = (storeId: string) => {
  revalidatePath(settingsPath(storeId, "/tax"));
};

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function updateTaxSettingsAction(
  storeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await updateTaxSettings(ctx, {
      pricesIncludeTax: text(formData, "pricesIncludeTax"),
      chargeTaxOnShipping: text(formData, "chargeTaxOnShipping"),
      taxRegistrationId: text(formData, "taxRegistrationId"),
    });
    refresh(ctx.storeId);
    return { ok: true, message: "Tax settings saved." };
  }, formData);
}

export async function saveTaxRateAction(
  storeId: string,
  rateId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const input = {
      name: text(formData, "name"),
      countryCode: text(formData, "countryCode"),
      regionCode: text(formData, "regionCode"),
      rate: text(formData, "rate"),
    };
    if (rateId) await updateTaxRate(ctx, rateId, input);
    else await createTaxRate(ctx, input);
    refresh(ctx.storeId);
    return { ok: true, message: rateId ? "Tax rate saved." : "Tax rate added." };
  }, formData);
}

export async function deleteTaxRateAction(
  storeId: string,
  rateId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await deleteTaxRate(ctx, rateId);
    refresh(ctx.storeId);
    return { ok: true, message: "Tax rate deleted." };
  });
}
