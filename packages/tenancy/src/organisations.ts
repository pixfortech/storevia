import "server-only";
import { withTenant } from "@storevia/database";
import { consumeRateLimit } from "@storevia/security/server";
import { DomainError, uuidv7 } from "@storevia/types";
import { countrySchema, displayNameSchema } from "@storevia/validation";
import { z } from "zod";
import { recordAudit } from "./audit";
import {
  requirePermission,
  requireVerifiedPrincipal,
  scopeOf,
  userScope,
  type OrganisationContext,
  type Principal,
  type RequestInfo,
} from "./context";
import { parseInput } from "./errors";
import { permissionsFor, type MemberRole } from "./rbac";

export const createOrganisationSchema = z.object({
  name: displayNameSchema("organisation"),
  country: z
    .union([z.literal(""), countrySchema])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export interface OrganisationSummary {
  readonly id: string;
  readonly name: string;
  readonly role: MemberRole;
}

/**
 * Creates an organisation with the principal as its single OWNER
 * (User → Membership → Organisation). Both rows are written in one
 * transaction whose RLS scope is the new organisation.
 */
export async function createOrganisation(
  principalInput: Principal | null | undefined,
  input: unknown,
  request: RequestInfo = {},
): Promise<{ organisationId: string }> {
  const principal = requireVerifiedPrincipal(principalInput);
  const data = parseInput(createOrganisationSchema, input);
  const limit = await consumeRateLimit(
    { name: "tenancy:create-organisation", limit: 10, windowSeconds: 24 * 3600 },
    principal.userId,
  );
  if (!limit.allowed)
    throw new DomainError(
      "RATE_LIMITED",
      "You've created several organisations today. Please try again tomorrow.",
    );

  const organisationId = uuidv7();
  await withTenant({ organisationId, storeId: null, userId: principal.userId }, async (tx) => {
    await tx.organisation.create({
      data: {
        id: organisationId,
        name: data.name,
        country: data.country,
        createdById: principal.userId,
      },
      select: { id: true },
    });
    const membership = await tx.membership.create({
      data: { organisationId, userId: principal.userId, role: "OWNER", allStores: true },
      select: { id: true },
    });
    const ctx: OrganisationContext = {
      kind: "organisation",
      principal,
      userId: principal.userId,
      organisationId,
      organisationName: data.name,
      membershipId: membership.id,
      role: "OWNER",
      permissions: permissionsFor("OWNER"),
      allStores: true,
      request,
    };
    await recordAudit(
      tx,
      ctx,
      "organisation.created",
      { type: "Organisation", id: organisationId },
      { name: data.name },
    );
  });
  return { organisationId };
}

/** Organisations where the principal has an ACTIVE membership. */
export async function listMyOrganisations(
  principalInput: Principal | null | undefined,
): Promise<OrganisationSummary[]> {
  const principal = requireVerifiedPrincipal(principalInput);
  const rows = await withTenant(userScope(principal), (tx) =>
    tx.membership.findMany({
      where: { userId: principal.userId, status: "ACTIVE", organisation: { status: "ACTIVE" } },
      select: { role: true, organisation: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
  );
  return rows.map((row) => ({
    id: row.organisation.id,
    name: row.organisation.name,
    role: row.role,
  }));
}

export const renameOrganisationSchema = z.object({ name: displayNameSchema("organisation") });

export async function renameOrganisation(ctx: OrganisationContext, input: unknown): Promise<void> {
  requirePermission(ctx, "organisation.update");
  const data = parseInput(renameOrganisationSchema, input);
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.organisation.update({
      where: { id: ctx.organisationId },
      data: { name: data.name },
      select: { id: true },
    });
    await recordAudit(
      tx,
      ctx,
      "organisation.updated",
      { type: "Organisation", id: ctx.organisationId },
      { fields: "name" },
    );
  });
}
