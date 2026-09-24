"use server";

import {
  activateSubscription,
  assignPlan,
  cancelSubscription,
  changeSubscription,
  expireSubscription,
  reconcileOrganisationUsage,
  removeEntitlementOverride,
  setEntitlementOverride,
  simulateMockBillingEvent,
  type ManualResult,
} from "@storevia/billing";
import { revalidatePath } from "next/cache";
import { formObject, runAction, type ActionState } from "@/lib/action";
import { requireActionStaff } from "@/lib/auth";
import { formatLimit } from "@/lib/format";

// Every action resolves the staff member again (PlatformStaff is re-read on
// each request) and passes untrusted form input to the billing services,
// which check the platform permission, step-up and reason themselves.
// `orgId` is a bound argument from the page: untrusted, parsed by the service.

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
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionStaff();
    const { corrected } = await reconcileOrganisationUsage(ctx, orgId);
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
