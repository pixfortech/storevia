import "server-only";
import { withTenant, type TenantScope } from "@storevia/database";
import { forbidden, notFound, parseTypeId, unauthenticated, type IdKind } from "@storevia/types";
import type { BusinessType } from "./business-types";
import { permissionsFor, type MemberRole, type Permission } from "./rbac";

/**
 * The authenticated user, as established by packages/auth from the session.
 * Tenancy never accepts a user ID from anywhere else.
 */
export interface Principal {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  /** Step-up re-authentication happened recently (see packages/auth). */
  readonly recentlyAuthenticated: boolean;
}

export interface RequestInfo {
  readonly requestId?: string | undefined;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | null | undefined;
}

/**
 * Trusted server-side context (docs/architecture/03-tenancy.md §4). Only the
 * resolvers in this module can create one; `scopeOf` refuses anything else.
 */
export interface OrganisationContext {
  readonly kind: "organisation";
  readonly principal: Principal;
  readonly userId: string;
  readonly organisationId: string;
  readonly organisationName: string;
  readonly membershipId: string;
  readonly role: MemberRole;
  readonly permissions: ReadonlySet<Permission>;
  /** false when the membership is limited to specific stores. */
  readonly allStores: boolean;
  readonly request: RequestInfo;
}

export interface StoreContext extends Omit<OrganisationContext, "kind"> {
  readonly kind: "store";
  readonly storeId: string;
  readonly storeName: string;
  readonly storeSlug: string;
  readonly storeStatus: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  /** Presentation only (ADR-0024); never used for authorisation. */
  readonly storeBusinessType: BusinessType;
}

export type TenantContext = OrganisationContext | StoreContext;

const issued = new WeakSet<object>();

function issue<T extends TenantContext>(ctx: T): T {
  Object.freeze(ctx);
  issued.add(ctx);
  return ctx;
}

/** The RLS scope for withTenant(). Throws for contexts not issued by a resolver. */
export function scopeOf(ctx: TenantContext): TenantScope {
  if (!issued.has(ctx)) throw new Error("scopeOf: context was not issued by packages/tenancy");
  return {
    organisationId: ctx.organisationId,
    storeId: ctx.kind === "store" ? ctx.storeId : null,
    userId: ctx.userId,
  };
}

/** RLS scope for queries about the user themself (their memberships). */
export function userScope(principal: Principal): TenantScope {
  return { organisationId: null, storeId: null, userId: principal.userId };
}

export function requireVerifiedPrincipal(principal: Principal | null | undefined): Principal {
  if (!principal) throw unauthenticated();
  if (!principal.emailVerified) throw forbidden();
  return principal;
}

/** Parses a public TypeID from a URL/body. Malformed IDs are indistinguishable from missing ones. */
export function parsePublicId(kind: IdKind, value: unknown): string {
  if (typeof value !== "string") throw notFound();
  const uuid = parseTypeId(kind, value);
  if (!uuid) throw notFound();
  return uuid;
}

export function hasPermission(ctx: TenantContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/** 403 for a resource the user can see but not act on. */
export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!ctx.permissions.has(permission)) throw forbidden();
}

/**
 * Verifies an ACTIVE membership in an ACTIVE organisation. Any failure is a
 * 404 so organisation IDs can't be probed (docs 03 §3 non-disclosure).
 */
export async function requireOrganisationAccess(
  principalInput: Principal | null | undefined,
  organisationPublicId: unknown,
  request: RequestInfo = {},
): Promise<OrganisationContext> {
  const principal = requireVerifiedPrincipal(principalInput);
  const organisationId = parsePublicId("organisation", organisationPublicId);
  const membership = await withTenant(
    { organisationId, storeId: null, userId: principal.userId },
    (tx) =>
      tx.membership.findFirst({
        where: {
          organisationId,
          userId: principal.userId,
          status: "ACTIVE",
          organisation: { status: "ACTIVE" },
        },
        select: {
          id: true,
          role: true,
          allStores: true,
          organisation: { select: { name: true } },
        },
      }),
  );
  if (!membership) throw notFound();
  return issue<OrganisationContext>({
    kind: "organisation",
    principal,
    userId: principal.userId,
    organisationId,
    organisationName: membership.organisation.name,
    membershipId: membership.id,
    role: membership.role,
    permissions: permissionsFor(membership.role),
    allStores: membership.allStores,
    request,
  });
}

/**
 * Verifies membership of the store's organisation AND access to this store
 * (allStores or an explicit MembershipStoreAccess row). 404 on any failure.
 */
export async function requireStoreAccess(
  principalInput: Principal | null | undefined,
  storePublicId: unknown,
  request: RequestInfo = {},
): Promise<StoreContext> {
  const principal = requireVerifiedPrincipal(principalInput);
  const storeId = parsePublicId("store", storePublicId);

  // RLS (member_read) only reveals stores in organisations where the user
  // has an ACTIVE membership, so this lookup cannot see other tenants.
  const store = await withTenant(
    { organisationId: null, storeId: null, userId: principal.userId },
    (tx) =>
      tx.store.findFirst({
        where: { id: storeId },
        select: {
          id: true,
          organisationId: true,
          name: true,
          slug: true,
          status: true,
          businessType: true,
        },
      }),
  );
  if (!store) throw notFound();

  const membership = await withTenant(
    { organisationId: store.organisationId, storeId: store.id, userId: principal.userId },
    (tx) =>
      tx.membership.findFirst({
        where: {
          organisationId: store.organisationId,
          userId: principal.userId,
          status: "ACTIVE",
          organisation: { status: "ACTIVE" },
        },
        select: {
          id: true,
          role: true,
          allStores: true,
          organisation: { select: { name: true } },
          storeAccess: { where: { storeId: store.id }, select: { storeId: true } },
        },
      }),
  );
  if (!membership) throw notFound();
  if (!membership.allStores && membership.storeAccess.length === 0) throw notFound();

  return issue<StoreContext>({
    kind: "store",
    principal,
    userId: principal.userId,
    organisationId: store.organisationId,
    organisationName: membership.organisation.name,
    membershipId: membership.id,
    role: membership.role,
    permissions: permissionsFor(membership.role),
    allStores: membership.allStores,
    storeId: store.id,
    storeName: store.name,
    storeSlug: store.slug,
    storeStatus: store.status,
    storeBusinessType: store.businessType,
    request,
  });
}

export async function requireStorePermission(
  principal: Principal | null | undefined,
  storePublicId: unknown,
  permission: Permission,
  request: RequestInfo = {},
): Promise<StoreContext> {
  const ctx = await requireStoreAccess(principal, storePublicId, request);
  requirePermission(ctx, permission);
  return ctx;
}

export async function requireOrganisationPermission(
  principal: Principal | null | undefined,
  organisationPublicId: unknown,
  permission: Permission,
  request: RequestInfo = {},
): Promise<OrganisationContext> {
  const ctx = await requireOrganisationAccess(principal, organisationPublicId, request);
  requirePermission(ctx, permission);
  return ctx;
}

/** Narrows to an organisation-level context view of a store context (same membership). */
export function organisationOf(ctx: TenantContext): OrganisationContext {
  if (ctx.kind === "organisation") return ctx;
  return issue<OrganisationContext>({
    kind: "organisation",
    principal: ctx.principal,
    userId: ctx.userId,
    organisationId: ctx.organisationId,
    organisationName: ctx.organisationName,
    membershipId: ctx.membershipId,
    role: ctx.role,
    permissions: ctx.permissions,
    allStores: ctx.allStores,
    request: ctx.request,
  });
}
