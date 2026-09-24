import "server-only";
import { withTenant } from "@storevia/database";
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

/**
 * Loads a membership of the context's organisation that the actor may manage:
 * not themself, not the OWNER, and holding a role within the actor's own
 * permissions (subset rule, docs 04 §7.4).
 */
async function loadManageableMember(ctx: OrganisationContext, membershipPublicId: unknown) {
  requirePermission(ctx, "member.manage");
  const membershipId = parsePublicId("membership", membershipPublicId);
  const target = await withTenant(scopeOf(ctx), (tx) =>
    tx.membership.findFirst({
      where: { id: membershipId, organisationId: ctx.organisationId },
      select: { id: true, userId: true, role: true, status: true },
    }),
  );
  if (!target) throw notFound();
  if (target.userId === ctx.userId)
    throw new DomainError("FORBIDDEN", "You can't change your own membership here.");
  if (target.role === "OWNER")
    throw new DomainError(
      "FORBIDDEN",
      "The owner's membership can only change through an ownership transfer.",
    );
  if (!canAssignRole(ctx.role, target.role)) throw forbidden();
  return target;
}

export async function changeMemberRole(
  ctx: OrganisationContext,
  membershipPublicId: unknown,
  input: unknown,
): Promise<void> {
  const { role } = parseInput(z.object({ role: assignableRole }), input);
  const target = await loadManageableMember(ctx, membershipPublicId);
  if (!canAssignRole(ctx.role, role)) throw forbidden();
  if (target.role === role) return;
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.membership.update({ where: { id: target.id }, data: { role }, select: { id: true } });
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
  const { status } = parseInput(z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }), input);
  const target = await loadManageableMember(ctx, membershipPublicId);
  if (target.status === status) return;
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.membership.update({
      where: { id: target.id },
      data: { status },
      select: { id: true },
    });
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
  const target = await loadManageableMember(ctx, membershipPublicId);
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.membership.delete({ where: { id: target.id }, select: { id: true } });
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

export async function setMemberStoreAccess(
  ctx: OrganisationContext,
  membershipPublicId: unknown,
  input: unknown,
): Promise<void> {
  const data = parseInput(storeAccessSchema, input);
  const target = await loadManageableMember(ctx, membershipPublicId);
  const storeIds = [...new Set(data.storeIds.map((id) => parsePublicId("store", id)))];
  if (!data.allStores && storeIds.length === 0) {
    throw new DomainError("VALIDATION_FAILED", "Choose at least one store.", {
      storeIds: "Choose at least one store.",
    });
  }
  await withTenant(scopeOf(ctx), async (tx) => {
    if (!data.allStores) {
      const found = await tx.store.count({
        where: { id: { in: storeIds }, organisationId: ctx.organisationId },
      });
      if (found !== storeIds.length) throw notFound();
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
    await tx.membership.update({
      where: { id: target.id },
      data: { allStores: data.allStores },
      select: { id: true },
    });
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
    await tx.membership.update({
      where: { id: ctx.membershipId },
      data: { role: "ADMIN", allStores: true },
      select: { id: true },
    });
    await tx.membership.update({
      where: { id: target.id },
      data: { role: "OWNER", allStores: true },
      select: { id: true },
    });
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
    await recordAudit(tx, ctx, "member.left", { type: "Membership", id: ctx.membershipId });
  });
}
