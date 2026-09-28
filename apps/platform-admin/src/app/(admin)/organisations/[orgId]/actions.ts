"use server";

import {
  activateSubscription,
  assignPlan,
  cancelSubscription,
  changeSubscription,
  expireSubscription,
  extendGrace,
  reconcileOrganisationUsage,
  retryFailedOrderEmails,
  setOrganisationSuspension,
  setStoreSuspension,
  removeEntitlementOverride,
  setEntitlementOverride,
  simulateMockBillingEvent,
  type ManualResult,
} from "@storevia/billing";
import { revalidatePath } from "next/cache";
import { formObject, runAction, type ActionState } from "@/lib/action";
import { requireActionStaff } from "@/lib/auth";
import { registerEntitlementListeners } from "@/lib/billing-events";
import { formatLimit } from "@/lib/format";

// Every action resolves the staff member again (PlatformStaff is re-read on
// each request) and passes untrusted form input to the billing services,
// which check the platform permission, step-up and reason themselves.
// `orgId` is a bound argument from the page: untrusted, parsed by the service.

registerEntitlementListeners();

type Fields = Record<string, string>;

/** "No expiry" clears the date; "expire on" keeps it. */
function withExpiry(fields: Fields): Fields {
  if (fields["expiryMode"] === "none") return { ...fields, expiresAt: "" };
  return fields;
}

function done(message: string, result: ManualResult): ActionState {
  if (result.overLimit.length === 0) return { ok: true, message };
  const over = result.overLimit
    .map((l) => `${l.name.toLowerCase()} (${l.usage.toString()} of ${formatLimit(l.limit)})`)
    .join(", ");
  return {
    ok: true,
    message: `${message} The organisation is over its limit for ${over}. Existing resources keep working; new ones are blocked.`,
  };
}

function refresh(orgId: string): void {
  revalidatePath(`/organisations/${orgId}`);
  revalidatePath("/organisations");
}

export async function assignPlanAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const fields = withExpiry(formObject(formData));
    const result = await assignPlan(ctx, { ...fields, organisationId: orgId });
    refresh(orgId);
    return done(fields["status"] === "TRIAL" ? "Trial started." : "Plan assigned.", result);
  }, formData);
}

export async function changeSubscriptionAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const result = await changeSubscription(ctx, {
      ...withExpiry(formObject(formData)),
      organisationId: orgId,
    });
    refresh(orgId);
    return done("Subscription updated.", result);
  }, formData);
}

export async function activateAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const result = await activateSubscription(ctx, {
      ...withExpiry(formObject(formData)),
      organisationId: orgId,
    });
    refresh(orgId);
    return done("Subscription activated.", result);
  }, formData);
}

export async function cancelAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const result = await cancelSubscription(ctx, {
      ...formObject(formData),
      organisationId: orgId,
    });
    refresh(orgId);
    return done("Subscription cancelled. Access continues until the chosen date.", result);
  }, formData);
}

export async function expireAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const result = await expireSubscription(ctx, {
      ...formObject(formData),
      organisationId: orgId,
    });
    refresh(orgId);
    return done("Subscription expired. System defaults now apply.", result);
  }, formData);
}

export async function setOverrideAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const result = await setEntitlementOverride(ctx, {
      ...withExpiry(formObject(formData)),
      organisationId: orgId,
    });
    refresh(orgId);
    return done("Override saved.", result);
  }, formData);
}

export async function removeOverrideAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const result = await removeEntitlementOverride(ctx, {
      ...formObject(formData),
      organisationId: orgId,
    });
    refresh(orgId);
    return done("Override removed.", result);
  }, formData);
}

export async function reconcileUsageAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const { corrected } = await reconcileOrganisationUsage(ctx, {
      ...formObject(formData),
      organisationId: orgId,
    });
    refresh(orgId);
    return {
      ok: true,
      message:
        corrected === 0
          ? "Usage counters were already correct."
          : `Corrected ${String(corrected)} usage counter(s).`,
    };
  });
}

export async function simulateAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const result = await simulateMockBillingEvent(ctx, {
      ...formObject(formData),
      organisationId: orgId,
    });
    refresh(orgId);
    const detail = result.detail ? ` (${result.detail})` : "";
    return {
      ok:
        result.outcome === "processed" ||
        result.outcome === "duplicate" ||
        result.outcome === "ignored",
      message: `Webhook ${result.outcome}${detail}: HTTP ${String(result.status)}.`,
    };
  }, formData);
}

/** Failed-payment recovery: a later grace end for a past-due subscription (M8). */
export async function extendGraceAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const result = await extendGrace(ctx, { ...formObject(formData), organisationId: orgId });
    refresh(orgId);
    return done("Grace period extended. The merchant is emailed the new date.", result);
  });
}

// Support repairs (M8): platform.support.manage, step-up, the target's name
// typed out and a reason, all checked by the service.

export async function organisationSuspensionAction(
  orgId: string,
  suspend: boolean,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    await setOrganisationSuspension(ctx, {
      ...formObject(formData),
      organisationId: orgId,
      suspend,
    });
    refresh(orgId);
    return {
      ok: true,
      message: suspend
        ? "Organisation suspended. Its stores are offline everywhere."
        : "Organisation restored.",
    };
  });
}

export async function storeSuspensionAction(
  orgId: string,
  storeId: string,
  suspend: boolean,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const { status } = await setStoreSuspension(ctx, {
      ...formObject(formData),
      storeId,
      suspend,
    });
    refresh(orgId);
    return {
      ok: true,
      message: suspend
        ? "Store suspended. Its storefront is offline everywhere."
        : `Store restored (${status.toLowerCase()}).`,
    };
  });
}

export async function retryEmailsAction(
  orgId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const { queued } = await retryFailedOrderEmails(ctx, {
      ...formObject(formData),
      organisationId: orgId,
    });
    refresh(orgId);
    return {
      ok: true,
      message:
        queued === 0 ? "No failed emails to retry." : `${String(queued)} email(s) queued again.`,
    };
  });
}
