"use server";

import {
  addCustomDomain,
  checkCustomDomain,
  removeCustomDomain,
  setPrimaryDomain,
} from "@storevia/tenancy/domains";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { settingsPath } from "@/lib/settings-tabs";
import { storeActionContext } from "@/lib/store-action";

// Custom domains (ADR-0032): the tenancy services check `domain.manage`, the
// custom_domain feature and the store's ownership of the domain id on every
// call; hiding a button here is presentation only.

const refresh = (storeId: string) => {
  revalidatePath(settingsPath(storeId, "/domains"));
  revalidatePath(settingsPath(storeId));
};

export async function addDomainAction(
  storeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const hostname = formData.get("hostname");
    const domain = await addCustomDomain(ctx, {
      hostname: typeof hostname === "string" ? hostname : "",
    });
    refresh(ctx.storeId);
    return {
      ok: true,
      message:
        domain.status === "ACTIVE"
          ? `${domain.hostname} is connected.`
          : `${domain.hostname} added. Add the DNS records below to connect it.`,
    };
  }, formData);
}

export async function checkDomainAction(
  storeId: string,
  domainId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    const domain = await checkCustomDomain(ctx, domainId);
    refresh(ctx.storeId);
    return {
      ok: true,
      message:
        domain.status === "ACTIVE" && !domain.message
          ? `${domain.hostname} is connected.`
          : (domain.message ?? "Checked. We'll keep checking automatically."),
    };
  });
}

export async function makePrimaryDomainAction(
  storeId: string,
  domainId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await setPrimaryDomain(ctx, domainId);
    refresh(ctx.storeId);
    return { ok: true, message: "Primary domain changed." };
  });
}

export async function removeDomainAction(
  storeId: string,
  domainId: string,
  _prev: ActionState,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await storeActionContext(storeId);
    await removeCustomDomain(ctx, domainId);
    refresh(ctx.storeId);
    return { ok: true, message: "Domain removed." };
  });
}
