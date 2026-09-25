// Real tenancy contexts for commerce integration tests: users, organisations,
// stores and memberships are created through the same services (or rows)
// production uses, and every context comes from requireStoreAccess.
import { migratorDb } from "@storevia/database/testing";
import {
  createOrganisation,
  createStore,
  requireOrganisationAccess,
  requireStoreAccess,
  type MemberRole,
  type OrganisationContext,
  type Principal,
  type StoreContext,
} from "@storevia/tenancy";
import { toTypeId, uuidv7, type DomainError } from "@storevia/types";
import { expect } from "vitest";

process.env["STOREFRONT_ROOT_DOMAIN"] = "storevia.site";

let counter = 0;

export async function makeUser(label: string): Promise<Principal> {
  counter += 1;
  const email = `${label}-${String(counter)}@example.test`;
  const user = await migratorDb().user.create({
    data: { id: uuidv7(), email, name: `User ${label}`, emailVerified: true },
  });
  return {
    userId: user.id,
    email,
    name: user.name,
    emailVerified: true,
    recentlyAuthenticated: false,
  };
}

export async function subscribe(organisationId: string, planKey: string): Promise<string> {
  const db = migratorDb();
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  const sub = await db.subscription.create({
    data: {
      organisationId,
      planId: plan.id,
      status: "ACTIVE",
      source: "MANUAL",
      startedAt: new Date(),
    },
  });
  return sub.id;
}

export async function changePlan(subscriptionId: string, planKey: string): Promise<void> {
  const db = migratorDb();
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  await db.subscription.update({ where: { id: subscriptionId }, data: { planId: plan.id } });
}

export interface Tenant {
  readonly owner: Principal;
  readonly org: OrganisationContext;
  readonly stores: StoreContext[];
}

/** An organisation on the given plan with `storeCount` stores (currency per store). */
export async function makeTenant(
  label: string,
  options: {
    readonly plan?: string;
    readonly stores?: readonly { currency: string; country?: string }[];
  } = {},
): Promise<Tenant> {
  const owner = await makeUser(`${label}-owner`);
  const { organisationId } = await createOrganisation(owner, { name: `Org ${label}` });
  const org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
  await subscribe(organisationId, options.plan ?? "business");
  const stores: StoreContext[] = [];
  for (const [i, store] of (options.stores ?? [{ currency: "INR" }]).entries()) {
    counter += 1;
    const slug = `${label}-${String(i)}-${String(counter)}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const { storeId } = await createStore(org, {
      name: `Store ${label} ${String(i)}`,
      slug,
      currency: store.currency,
      country: store.country ?? "IN",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
    });
    stores.push(await requireStoreAccess(owner, toTypeId("store", storeId)));
  }
  return { owner, org, stores };
}

export function storeOf(tenant: Tenant, i = 0): StoreContext {
  const store = tenant.stores[i];
  if (!store) throw new Error(`tenant has no store ${String(i)}`);
  return store;
}

/** A member with `role` (all stores unless `storeIds` limits them), as a store context. */
export async function memberContext(
  tenant: Tenant,
  role: MemberRole,
  store: StoreContext,
  options: { readonly storeIds?: readonly string[] } = {},
): Promise<StoreContext> {
  const user = await makeUser(role.toLowerCase());
  const db = migratorDb();
  const membership = await db.membership.create({
    data: {
      organisationId: tenant.org.organisationId,
      userId: user.userId,
      role,
      status: "ACTIVE",
      allStores: options.storeIds === undefined,
    },
  });
  for (const storeId of options.storeIds ?? []) {
    await db.membershipStoreAccess.create({
      data: { membershipId: membership.id, organisationId: tenant.org.organisationId, storeId },
    });
  }
  return requireStoreAccess(user, toTypeId("store", store.storeId));
}

export async function expectCode(
  promise: Promise<unknown>,
  code: DomainError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

export const productInput = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  ...extra,
});
