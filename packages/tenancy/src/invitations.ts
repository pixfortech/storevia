import "server-only";
import { withTenant } from "@storevia/database";
import { systemDb } from "@storevia/database/system";
import { getEmailSender, invitationMessage } from "@storevia/email";
import { consumeRateLimit } from "@storevia/security/server";
import { generateToken, hashToken } from "@storevia/security";
import { DomainError, forbidden, notFound } from "@storevia/types";
import { emailSchema } from "@storevia/validation";
import { z } from "zod";
import { recordAudit } from "./audit";
import {
  parsePublicId,
  requirePermission,
  requireVerifiedPrincipal,
  scopeOf,
  type OrganisationContext,
  type Principal,
  type RequestInfo,
} from "./context";
import { parseInput } from "./errors";
import { conflict } from "./internal";
import { canAssignRole, MEMBER_ROLES, permissionsFor, ROLE_LABELS, type MemberRole } from "./rbac";

const INVITATION_TTL_MS = 7 * 24 * 3600 * 1000;

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(MEMBER_ROLES).refine((role) => role !== "OWNER", "Choose a role."),
});

export interface InvitationView {
  readonly id: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface InvitationPreview {
  readonly organisationName: string;
  readonly role: MemberRole;
  readonly email: string;
  readonly usable: boolean;
}

/**
 * Invites someone by email. The token is emailed and only its SHA-256 hash is
 * stored. `acceptUrl` builds the link (the dashboard's /invitations/{token}).
 */
export async function createInvitation(
  ctx: OrganisationContext,
  input: unknown,
  acceptUrl: (token: string) => string,
): Promise<{ invitationId: string }> {
  requirePermission(ctx, "member.manage");
  const data = parseInput(createInvitationSchema, input);
  if (!canAssignRole(ctx.role, data.role)) throw forbidden();
  const limit = await consumeRateLimit(
    { name: "tenancy:invite", limit: 50, windowSeconds: 24 * 3600 },
    ctx.organisationId,
  );
  if (!limit.allowed)
    throw new DomainError("RATE_LIMITED", "Too many invitations today. Please try again tomorrow.");

  const token = generateToken();
  const invitationId = await withTenant(scopeOf(ctx), async (tx) => {
    const existingMember = await tx.membership.findFirst({
      where: { organisationId: ctx.organisationId, user: { email: data.email } },
      select: { id: true },
    });
    if (existingMember)
      throw conflict("That person is already a member.", { email: "Already a member." });
    // A new invitation replaces any pending one for the same email.
    await tx.invitation.updateMany({
      where: { organisationId: ctx.organisationId, email: data.email, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    const invitation = await tx.invitation.create({
      data: {
        organisationId: ctx.organisationId,
        email: data.email,
        role: data.role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedById: ctx.userId,
      },
      select: { id: true },
    });
    await recordAudit(
      tx,
      ctx,
      "member.invited",
      { type: "Invitation", id: invitation.id },
      { email: data.email, role: data.role },
    );
    return invitation.id;
  });

  // Sent after commit: no network I/O inside the transaction.
  await getEmailSender().send(
    invitationMessage(
      data.email,
      ctx.principal.name,
      ctx.organisationName,
      ROLE_LABELS[data.role],
      acceptUrl(token),
    ),
  );
  return { invitationId };
}

export async function listInvitations(ctx: OrganisationContext): Promise<InvitationView[]> {
  requirePermission(ctx, "member.read");
  return withTenant(scopeOf(ctx), (tx) =>
    tx.invitation.findMany({
      where: {
        organisationId: ctx.organisationId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
}

export async function revokeInvitation(
  ctx: OrganisationContext,
  invitationPublicId: unknown,
): Promise<void> {
  requirePermission(ctx, "member.manage");
  const invitationId = parsePublicId("invitation", invitationPublicId);
  await withTenant(scopeOf(ctx), async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitationId, organisationId: ctx.organisationId, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    if (count === 0) throw notFound();
    await recordAudit(tx, ctx, "member.invitation_revoked", {
      type: "Invitation",
      id: invitationId,
    });
  });
}

/**
 * Looks an invitation up by its token. The invitee isn't a member yet, so this
 * is one of the few allow-listed system-role queries (docs 03 §5.3).
 */
async function findByToken(token: unknown) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  return systemDb().invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      organisationId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      organisation: { select: { name: true, status: true } },
    },
  });
}

export async function previewInvitation(token: unknown): Promise<InvitationPreview | null> {
  const invitation = await findByToken(token);
  if (!invitation) return null;
  return {
    organisationName: invitation.organisation.name,
    role: invitation.role,
    email: invitation.email,
    usable:
      invitation.status === "PENDING" &&
      invitation.expiresAt > new Date() &&
      invitation.organisation.status === "ACTIVE",
  };
}

/**
 * Accepts an invitation for the signed-in principal. The principal's verified
 * email must match the invited email; the invitation is consumed atomically.
 */
export async function acceptInvitation(
  principalInput: Principal | null | undefined,
  token: unknown,
  request: RequestInfo = {},
): Promise<{ organisationId: string }> {
  const principal = requireVerifiedPrincipal(principalInput);
  const invitation = await findByToken(token);
  if (
    invitation?.status !== "PENDING" ||
    invitation.expiresAt <= new Date() ||
    invitation.organisation.status !== "ACTIVE"
  ) {
    throw new DomainError("NOT_FOUND", "This invitation is invalid or has expired.");
  }
  if (invitation.email.toLowerCase() !== principal.email.toLowerCase()) {
    throw new DomainError("FORBIDDEN", "This invitation was sent to a different email address.");
  }

  const organisationId = invitation.organisationId;
  await withTenant({ organisationId, storeId: null, userId: principal.userId }, async (tx) => {
    const consumed = await tx.invitation.updateMany({
      where: {
        id: invitation.id,
        organisationId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: { status: "ACCEPTED", acceptedById: principal.userId, acceptedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new DomainError("NOT_FOUND", "This invitation is invalid or has expired.");
    const existing = await tx.membership.findFirst({
      where: { organisationId, userId: principal.userId },
      select: { id: true },
    });
    if (existing) throw conflict("You're already a member of this organisation.");
    const membership = await tx.membership.create({
      data: { organisationId, userId: principal.userId, role: invitation.role, allStores: true },
      select: { id: true },
    });
    await recordAudit(
      tx,
      {
        kind: "organisation",
        principal,
        userId: principal.userId,
        organisationId,
        organisationName: invitation.organisation.name,
        membershipId: membership.id,
        role: invitation.role,
        permissions: permissionsFor(invitation.role),
        allStores: true,
        request,
      },
      "member.invitation_accepted",
      { type: "Membership", id: membership.id },
      { role: invitation.role },
    );
  });
  return { organisationId };
}
