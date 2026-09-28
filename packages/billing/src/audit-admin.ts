import "server-only";
import { platformDb } from "@storevia/database/platform";
import { requirePlatformPermission, type PlatformContext } from "@storevia/tenancy/platform";

// The platform audit log for platform-admin (M8): every tenant's entries and
// platform-level ones (staff sign-in, MFA, plan changes), newest first.
// Read-only: the platform role has SELECT and INSERT on AuditLog, never
// UPDATE or DELETE. IP addresses and user agents stay in the database for
// incident response and aren't shown; email addresses in metadata are
// masked.

export type AuditActorFilter = "ALL" | "USER" | "PLATFORM_STAFF" | "SYSTEM";

export interface PlatformAuditEntry {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: string;
  readonly actorType: string;
  /** A staff member's or merchant's name, when the actor is a person. */
  readonly actorName: string | null;
  readonly organisation: { readonly id: string; readonly name: string } | null;
  readonly storeId: string | null;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly requestId: string | null;
  /** Allow-listed at write time; emails masked here. */
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PlatformAuditPage {
  readonly entries: readonly PlatformAuditEntry[];
  readonly nextCursor: string | null;
}

const PAGE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CURSOR = /^(\d{1,15})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const ACTION_PREFIX = /^[a-z][a-z_.]{0,63}$/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/** "asha@example.com" → "a•••@example.com". */
const maskEmails = (value: string) =>
  value.replace(EMAIL, (email) => {
    const at = email.indexOf("@");
    return `${email.slice(0, 1)}•••${email.slice(at)}`;
  });

function displayMetadata(metadata: unknown): PlatformAuditEntry["metadata"] {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>).slice(0, 20)) {
    if (typeof value === "string") out[key] = maskEmails(value).slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean" || value === null)
      out[key] = value;
    else out[key] = maskEmails(JSON.stringify(value)).slice(0, 200);
  }
  return out;
}

export async function listPlatformAuditLog(
  ctx: PlatformContext,
  filter: {
    readonly organisationId?: string | undefined;
    readonly actor?: AuditActorFilter | undefined;
    readonly action?: string | undefined;
    readonly before?: string | null | undefined;
  } = {},
): Promise<PlatformAuditPage> {
  requirePlatformPermission(ctx, "platform.audit.read");
  const db = platformDb();
  const and: object[] = [];
  // Malformed filters are ignored rather than rejected: this is a viewer.
  if (filter.organisationId && UUID.test(filter.organisationId))
    and.push({ organisationId: filter.organisationId });
  if (filter.actor && filter.actor !== "ALL") and.push({ actorType: filter.actor });
  const action = filter.action?.trim().toLowerCase();
  if (action && ACTION_PREFIX.test(action)) and.push({ action: { startsWith: action } });
  const cursor = filter.before ? CURSOR.exec(filter.before) : null;
  if (cursor?.[1] && cursor[2]) {
    const at = new Date(Number(cursor[1]));
    and.push({ OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursor[2] } }] });
  }
  const rows = await db.auditLog.findMany({
    where: and.length > 0 ? { AND: and } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    select: {
      id: true,
      createdAt: true,
      action: true,
      actorType: true,
      actorId: true,
      organisationId: true,
      storeId: true,
      entityType: true,
      entityId: true,
      requestId: true,
      metadata: true,
    },
  });
  const page = rows.slice(0, PAGE);
  const orgIds = [...new Set(page.flatMap((r) => (r.organisationId ? [r.organisationId] : [])))];
  const userIds = [
    ...new Set(
      page.flatMap((r) =>
        (r.actorType === "USER" || r.actorType === "PLATFORM_STAFF") && r.actorId
          ? [r.actorId]
          : [],
      ),
    ),
  ];
  const [orgs, users] = await Promise.all([
    orgIds.length
      ? db.organisation.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [],
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const orgNames = new Map(orgs.map((o) => [o.id, o.name] as const));
  const userNames = new Map(users.map((u) => [u.id, u.name] as const));
  const last = page.at(-1);
  return {
    entries: page.map((row) => ({
      id: row.id,
      occurredAt: row.createdAt,
      action: row.action,
      actorType: row.actorType,
      actorName: row.actorId ? (userNames.get(row.actorId) ?? null) : null,
      organisation: row.organisationId
        ? { id: row.organisationId, name: orgNames.get(row.organisationId) ?? "Unknown" }
        : null,
      storeId: row.storeId,
      entityType: row.entityType,
      entityId: row.entityId,
      requestId: row.requestId,
      metadata: displayMetadata(row.metadata),
    })),
    nextCursor:
      rows.length > PAGE && last ? `${String(last.createdAt.getTime())}.${last.id}` : null,
  };
}
