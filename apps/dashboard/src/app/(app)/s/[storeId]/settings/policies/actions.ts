"use server";

import {
  getPolicy,
  policyByHandle,
  publishPolicy,
  savePolicyDraft,
  unpublishPolicy,
} from "@storevia/commerce";
import { requireStoreAccess } from "@storevia/tenancy";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/action";
import { requireActionPrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

export type PolicyActionState = ActionState & {
  /** The policy's revision after this action saved something (the editor's next save uses it). */
  readonly revision?: number | undefined;
};

/**
 * Saves a policy's draft, saves and publishes it, or unpublishes it
 * (final pass, Phase 2A). `storeId` and `handle` are bound by the client and
 * re-verified: another tenant's store is NOT_FOUND, an unknown handle a
 * validation error. Saves carry the revision the editor loaded; a stale one
 * is refused with a conflict. A draft saved before its publish is refused
 * (headings only) stays saved, and the new revision goes back to the editor.
 */
export async function policyAction(
  storeId: string,
  handle: string,
  _prev: PolicyActionState,
  formData: FormData,
): Promise<PolicyActionState> {
  let revision: number | undefined;
  const state = await runAction(async () => {
    const ctx = await requireStoreAccess(
      await requireActionPrincipal(),
      storeId,
      await requestInfo(),
    );
    const kind = policyByHandle(handle)?.kind;
    const intent = formData.get("intent");
    if (intent === "unpublish") {
      await unpublishPolicy(ctx, kind);
      revision = (await getPolicy(ctx, kind)).revision;
      return { ok: true, message: "Unpublished. Shoppers no longer see this policy." };
    }
    const saved = await savePolicyDraft(ctx, kind, {
      title: formData.get("title"),
      body: formData.get("body"),
      revision: formData.get("revision"),
    });
    revision = saved.revision;
    if (intent !== "publish") {
      return {
        ok: true,
        message:
          saved.status === "changed"
            ? "Draft saved. Shoppers see the published version until you publish."
            : "Draft saved.",
      };
    }
    revision = (await publishPolicy(ctx, kind, { revision })).revision;
    return { ok: true, message: "Published. Shoppers can read it on your store." };
  }, formData);
  if (revision === undefined) return state;
  revalidatePath(`/s/${storeId}`, "layout");
  return { ...state, revision };
}
