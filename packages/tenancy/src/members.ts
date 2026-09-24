import "server-only";
import { withTenant } from "@storevia/database";
import { assertFeature, releaseUsage } from "@storevia/entitlements";
import { DomainError, forbidden, notFound } from "@storevia/types";
import { z } from "zod";
import { recordAudit } from "./audit";
import { parsePublicId, requirePermission, scopeOf, type OrganisationContext } from "./context";
import { parseInput } from "./errors";
import { conflict } from "./internal";
import { canAssignRole, MEMBER_ROLES, type MemberRole } from "./rbac";

export interface MemberView {
  readonly membershipId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly status: "ACTIVE" | "SUSPENDED";
  readonly allStores: boolean;
  readonly storeIds: readonly string[];
  readonly isCurrentUser: boolean;
  readonly joinedAt: Date;
}

const assignableRole = z.enum(MEMBER_ROLES).refine((role) => role !== "OWNER", "Choose a role.");

export async function listMembers(ctx: OrganisationContext): Promise<MemberView[]> {
  requirePermission(ctx, "member.read");
  const rows = await withTenant(scopeOf(ctx), (tx) =>
    tx.membership.findMany({
      where: { organisationId: ctx.organisationId },
      select: {
        id: true,
        role: true,
        status: true,
        allStores: true,
        createdAt: true,
        storeAccess: { select: { storeId: true } },
        // Only granted, non-secret User columns (migration grants).
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
  );
  return rows.map((row) => ({
    membershipId: row.id,
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    role: row.role,
    status: row.status,
    allStores: row.allStores,
    storeIds: row.storeAccess.map((a) => a.storeId),
    isCurrentUser: row.user.id === ctx.userId,
    joinedAt: row.createdAt,
  }));
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

interface ManagedMember {
  readonly id: string;
  readonly userId: string;
  readonly role: MemberRole;
  readonly status: "ACTIVE" | "SUSPENDED";
}

/**
 * Loads, inside the caller's transaction, a membership of the context's
 * organisation that the actor may manage: not themself, not the OWNER, and
 * holding a role within the actor's own permissions (subset rule, docs 04
 * §7.4). Writes that follow must use `guard(target)` as their WHERE clause so
 * a concurrent change (e.g. an ownership transfer to this member) makes them
 * match nothing instead of overwriting the new state.
 */
async function loadManageableMember(
  tx: Tx,
  ctx: OrganisationContext,
  membershipId: string,
): Promise<ManagedMember> {
  const target = await tx.membership.findFirst({
    where: { id: membershipId, organisationId: ctx.organisationId },
    select: { id: true, userId: true, role: true, status: true },
  });
  if (!target) throw notFound();
  if (target.userId === ctx.userId) {
    throw new DomainError("FORBIDDEN", "You can't change your own membership here.");
  }
  if (target.role === "OWNER") {
    throw new DomainError(
      "FORBIDDEN",
      "The owner's membership can only change through an ownership transfer.",
    );
  }
  if (!canAssignRole(ctx.role, target.role)) throw forbidden();
  return target;
}

const guard = (ctx: OrganisationContext, target: ManagedMember) => ({
  id: target.id,
  organisationId: ctx.organisationId,
  role: target.role,
  status: target.status,
});

function assertApplied(count: number): void {
  if (count !== 1) throw conflict("This member changed in the meantime. Reload and try again.");
}

/** Invitations sent by someone who loses their membership or role no longer stand. */
async function revokeInvitationsFrom(
  tx: Tx,
  ctx: OrganisationContext,
  userId: string,
): Promise<void> {
  await tx.invitation.updateMany({
    where: { organisationId: ctx.organisationId, invitedById: userId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
}

/** Granting ADMIN needs a recent password confirmation (docs 04 §4 step-up). */
export function requireStepUpForRole(ctx: OrganisationContext, role: MemberRole): void {
  if (role === "ADMIN" && !ctx.principal.recentlyAuthenticated) {
    throw new DomainError(
      "REAUTHENTICATION_REQUIRED",
      "Confirm your password before granting the Admin role.",
    );
  }
}

export async function changeMemberRole(
  ctx: OrganisationContext,
  membershipPublicId: unknown,
  input: unknown,
): Promise<void> {
  requirePermission(ctx, "member.manage");
  const { role } = parseInput(z.object({ role: assignableRole }), input);
  const membershipId = parsePublicId("membership", membershipPublicId);
  if (!canAssignRole(ctx.role, role)) throw forbidden();
  requireStepUpForRole(ctx, role);
  await withTenant(scopeOf(ctx), async (tx) => {
    const target = await loadManageableMember(tx, ctx, membershipId);
    if (target.role === role) return;
    const { count } = await tx.membership.updateMany({ where: guard(ctx, target), data: { role } });
    assertApplied(count);
    await revokeInvitationsFrom(tx, ctx, target.userId);
    await recordAudit(
      tx,
      ctx,
      "member.role_changed",
      { type: "Membership", id: target.id },
      {
        role,
        previousRole: target.role,
        targetUserId: target.userId,
      },
    );
  });
}

export async function setMemberStatus(
  ctx: OrganisationContext,
  membershipPublicId: unknown,
  input: unknown,
): Promise<void> {
  requirePermission(ctx, "member.manage");
  const { status } = parseInput(z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }), input);
  const membershipId = parsePublicId("membership", membershipPublicId);
  await withTenant(scopeOf(ctx), async (tx) => {
    const target = await loadManageableMember(tx, ctx, membershipId);
    if (target.status === status) return;
    const { count } = await tx.membership.updateMany({
      where: guard(ctx, target),
      data: { status },
    });
    assertApplied(count);
    if (status === "SUSPENDED") await revokeInvitationsFrom(tx, ctx, target.userId);
    await recordAudit(
      tx,
      ctx,
      status === "SUSPENDED" ? "member.suspended" : "member.reactivated",
      { type: "Membership", id: target.id },
      {
        status,
        previousStatus: target.status,
        targetUserId: target.userId,
      },
    );
  });
}

/** Removing a membership removes access, never business data (data-lifecycle §3). */
export async function removeMember(
  ctx: OrganisationContext,
  membershipPublicId: unknown,
): Promise<void> {
  requirePermission(ctx, "member.manage");
  const membershipId = parsePublicId("membership", membershipPublicId);
  await withTenant(scopeOf(ctx), async (tx) => {
    const target = await loadManageableMember(tx, ctx, membershipId);
    await revokeInvitationsFrom(tx, ctx, target.userId);
    const { count } = await tx.membership.deleteMany({ where: guard(ctx, target) });
    assertApplied(count);
    await releaseUsage(tx, ctx.organisationId, "staff_accounts");
    await recordAudit(
      tx,
      ctx,
      "member.removed",
      { type: "Membership", id: target.id },
      {
        role: target.role,
        targetUserId: target.userId,
      },
    );
  });
}

const storeAccessSchema = z.object({
  allStores: z.boolean(),
  storeIds: z.array(z.string()).max(200).default([]),
});

/**
 * Sets which stores a member can access. An actor can never grant more store
 * access than they have themself: only members with all-store access can
 * grant it, and store-limited actors can grant only their own stores.
 */
export async function setMemberStoreAccess(
  ctx: OrganisationContext,
  membershipPublicId: unknown,
  input: unknown,
): Promise<void> {
  requirePermission(ctx, "member.manage");
  const data = parseInput(storeAccessSchema, input);
  const membershipId = parsePublicId("membership", membershipPublicId);
  const storeIds = [...new Set(data.storeIds.map((id) => parsePublicId("store", id)))];
  if (!data.allStores && storeIds.length === 0) {
    throw new DomainError("VALIDATION_FAILED", "Choose at least one store.", {
      storeIds: "Choose at least one store.",
    });
  }
  if (data.allStores && !ctx.allStores) throw forbidden();
  await withTenant(scopeOf(ctx), async (tx) => {
    const target = await loadManageableMember(tx, ctx, membershipId);
    if (!data.allStores) {
      // Store-limited staff access is a plan feature. Removing a restriction
      // (back to all stores) is always allowed.
      await assertFeature(tx, ctx.organisationId, "advanced_permissions");
      const found = await tx.store.count({
        where: { id: { in: storeIds }, organisationId: ctx.organisationId },
      });
      if (found !== storeIds.length) throw notFound();
      if (!ctx.allStores) {
        const own = await tx.membershipStoreAccess.count({
          where: {
            membershipId: ctx.membershipId,
            organisationId: ctx.organisationId,
            storeId: { in: storeIds },
          },
        });
        if (own !== storeIds.length) throw notFound();
      }
    }
    await tx.membershipStoreAccess.deleteMany({
      where: { membershipId: target.id, organisationId: ctx.organisationId },
    });
    if (!data.allStores) {
      await tx.membershipStoreAccess.createMany({
        data: storeIds.map((storeId) => ({
          membershipId: target.id,
          organisationId: ctx.organisationId,
          storeId,
        })),
      });
    }
    const { count } = await tx.membership.updateMany({
      where: guard(ctx, target),
      data: { allStores: data.allStores },
    });
    assertApplied(count);
    await recordAudit(
      tx,
      ctx,
      "member.store_access_changed",
      { type: "Membership", id: target.id },
      {
        allStores: data.allStores,
        storeCount: storeIds.length,
        targetUserId: target.userId,
      },
    );
  });
}

/**
 * Moves ownership to an ACTIVE ADMIN. Requires `ownership.transfer` and a
 * recent step-up re-authentication. The previous owner becomes ADMIN. The
 * demotion runs first so the "one OWNER" unique index is never violated.
 */
export async function transferOwnership(
  ctx: OrganisationContext,
  membershipPublicId: unknown,
): Promise<void> {
  requirePermission(ctx, "ownership.transfer");
  if (!ctx.principal.recentlyAuthenticated) {
    throw new DomainError(
      "REAUTHENTICATION_REQUIRED",
      "Confirm your password to transfer ownership.",
    );
  }
  const membershipId = parsePublicId("membership", membershipPublicId);
  await withTenant(scopeOf(ctx), async (tx) => {
    const target = await tx.membership.findFirst({
      where: { id: membershipId, organisationId: ctx.organisationId },
      select: { id: true, userId: true, role: true, status: true },
    });
    if (!target) throw notFound();
    if (target.id === ctx.membershipId) throw conflict("You already own this organisation.");
    if (target.role !== "ADMIN" || target.status !== "ACTIVE") {
      throw conflict("Ownership can only be transferred to an active admin.");
    }
    // Conditional writes: if either membership changed concurrently, nothing
    // is written and the transaction rolls back.
    const demoted = await tx.membership.updateMany({
      where: {
        id: ctx.membershipId,
        organisationId: ctx.organisationId,
        role: "OWNER",
        status: "ACTIVE",
      },
      data: { role: "ADMIN", allStores: true },
    });
    assertApplied(demoted.count);
    const promoted = await tx.membership.updateMany({
      where: { id: target.id, organisationId: ctx.organisationId, role: "ADMIN", status: "ACTIVE" },
      data: { role: "OWNER", allStores: true },
    });
    assertApplied(promoted.count);
    await tx.membershipStoreAccess.deleteMany({
      where: { membershipId: target.id, organisationId: ctx.organisationId },
    });
    await recordAudit(
      tx,
      ctx,
      "organisation.ownership_transferred",
      { type: "Membership", id: target.id },
      {
        targetUserId: target.userId,
        previousRole: "ADMIN",
        role: "OWNER",
      },
    );
  });
}

/** A member leaves an organisation. The owner must transfer ownership first. */
export async function leaveOrganisation(ctx: OrganisationContext): Promise<void> {
  if (ctx.role === "OWNER") throw conflict("Transfer ownership before leaving this organisation.");
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.membership.delete({ where: { id: ctx.membershipId }, select: { id: true } });
    await releaseUsage(tx, ctx.organisationId, "staff_accounts");
    await recordAudit(tx, ctx, "member.left", { type: "Membership", id: ctx.membershipId });
  });
}
