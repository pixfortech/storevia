import "server-only";
import { withTenant } from "@storevia/database";
import { conflict, notFound, validationFailed } from "@storevia/types";
import { recordAudit } from "./audit";
import {
  parsePublicId,
  requirePermission,
  requireRecentAuthentication,
  requireVerifiedPrincipal,
  scopeOf,
  userScope,
  type OrganisationContext,
  type Principal,
  type RequestInfo,
} from "./context";

// Organisation deletion (M8, docs/database/data-lifecycle.md). The owner
// asks for it, with a recent password and the organisation's name typed
// out. Stores go offline at once and nobody can open the organisation, but
// for DELETION_COOLING_OFF_DAYS the owner can still change their mind.
// After that the worker erases personal data and detaches everything
// (app_delete_organisation). Orders, payments, refunds and tax records are
// kept, without personal data, for as long as the law requires.

export const DELETION_COOLING_OFF_DAYS = 30;

export async function requestOrganisationDeletion(
  ctx: OrganisationContext,
  input: { readonly confirmName?: unknown },
): Promise<{ readonly scheduledAt: Date }> {
  requirePermission(ctx, "organisation.delete");
  requireRecentAuthentication(ctx, "deleting the organisation");
  const typed = typeof input.confirmName === "string" ? input.confirmName.trim() : "";
  if (typed !== ctx.organisationName.trim()) {
    throw validationFailed({ confirmName: "Type the organisation's name exactly as shown." });
  }
  return withTenant(scopeOf(ctx), async (tx) => {
    const [row] = await tx.$queryRaw<{ due: Date | null }[]>`
      SELECT app_request_organisation_deletion(${ctx.organisationId}::uuid,
        ${DELETION_COOLING_OFF_DAYS}::int) AS due`;
    if (!row?.due) throw conflict("This organisation can't be deleted now.");
    await recordAudit(
      tx,
      ctx,
      "organisation.deletion_requested",
      { type: "Organisation", id: ctx.organisationId },
      { expiresAt: row.due.toISOString() },
    );
    return { scheduledAt: row.due };
  });
}

export interface PendingDeletion {
  readonly id: string;
  readonly name: string;
  readonly scheduledAt: Date;
}

/** Organisations this user owns that are waiting to be deleted. */
export async function listPendingDeletions(
  principalInput: Principal | null | undefined,
): Promise<PendingDeletion[]> {
  const principal = requireVerifiedPrincipal(principalInput);
  const rows = await withTenant(userScope(principal), (tx) =>
    tx.membership.findMany({
      where: {
        userId: principal.userId,
        status: "ACTIVE",
        role: "OWNER",
        organisation: { status: "PENDING_DELETION" },
      },
      select: { organisation: { select: { id: true, name: true, deletionScheduledAt: true } } },
      take: 20,
    }),
  );
  return rows.flatMap(({ organisation: o }) =>
    o.deletionScheduledAt ? [{ id: o.id, name: o.name, scheduledAt: o.deletionScheduledAt }] : [],
  );
}

/** The owner changes their mind within the cooling-off period. */
export async function cancelOrganisationDeletion(
  principalInput: Principal | null | undefined,
  organisationPublicId: unknown,
  request: RequestInfo = {},
): Promise<void> {
  const principal = requireVerifiedPrincipal(principalInput);
  const organisationId = parsePublicId("organisation", organisationPublicId);
  await withTenant({ organisationId, storeId: null, userId: principal.userId }, async (tx) => {
    const owner = await tx.membership.findFirst({
      where: {
        organisationId,
        userId: principal.userId,
        status: "ACTIVE",
        role: "OWNER",
        organisation: { status: "PENDING_DELETION" },
      },
      select: { id: true },
    });
    if (!owner) throw notFound();
    const [row] = await tx.$queryRaw<{ cancelled: boolean }[]>`
      SELECT app_cancel_organisation_deletion(${organisationId}::uuid) AS cancelled`;
    if (!row?.cancelled) {
      throw conflict("The deletion has already started and can't be cancelled.");
    }
    await tx.auditLog.createMany({
      data: [
        {
          organisationId,
          actorType: "USER",
          actorId: principal.userId,
          action: "organisation.deletion_cancelled",
          entityType: "Organisation",
          entityId: organisationId,
          ipAddress: request.ipAddress ?? null,
          userAgent: request.userAgent ?? null,
          requestId: request.requestId ?? null,
        },
      ],
    });
  });
}
