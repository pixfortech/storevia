import "server-only";
import { Prisma } from "@storevia/database";
import { recordAudit, type TenantContext } from "@storevia/tenancy";
import { validationFailed } from "@storevia/types";
import { parseRichText, richTextToPlainText, RichTextError, type RichTextDoc } from "../rich-text";
import { conflict, inStore } from "../internal";
import {
  isPolicyKind,
  POLICY_DEFINITIONS,
  policyDefinition,
  type StorePolicyKind,
} from "../policy-kinds";

// Store policies (final pass, Phase 2A): shipping, returns and refunds,
// cancellation, privacy, terms and contact, written by the merchant.
// Storevia never writes their text: a starter is section headings only,
// and a policy can't be published until it has text of the merchant's own.
// Each policy has a draft and a published copy; the storefront shows only
// the published one. Saves are guarded by a revision (two tabs can't
// silently overwrite each other). Reading needs `store.read`, writing
// `store.update`.

export type PolicyStatus = "empty" | "draft" | "published" | "changed";

export interface StorePolicyView {
  readonly kind: StorePolicyKind;
  readonly title: string;
  /** The draft body (null when nothing is written yet). */
  readonly body: RichTextDoc | null;
  readonly status: PolicyStatus;
  readonly publishedAt: Date | null;
  readonly revision: number;
  readonly updatedAt: Date | null;
}

const statusOf = (row: {
  bodyDoc: unknown;
  publishedDoc: unknown;
  title: string;
  publishedTitle: string | null;
}): PolicyStatus => {
  if (row.publishedDoc === null) return row.bodyDoc === null ? "empty" : "draft";
  const same =
    row.title === row.publishedTitle &&
    JSON.stringify(row.bodyDoc) === JSON.stringify(row.publishedDoc);
  return same ? "published" : "changed";
};

interface PolicyRow {
  kind: StorePolicyKind;
  title: string;
  bodyDoc: unknown;
  publishedTitle: string | null;
  publishedDoc: unknown;
  publishedAt: Date | null;
  revision: number;
  updatedAt: Date;
}

function view(kind: StorePolicyKind, row: PolicyRow | undefined): StorePolicyView {
  if (!row) {
    return {
      kind,
      title: policyDefinition(kind).defaultTitle,
      body: null,
      status: "empty",
      publishedAt: null,
      revision: 0,
      updatedAt: null,
    };
  }
  return {
    kind,
    title: row.title,
    body: parseStored(row.bodyDoc),
    status: statusOf(row),
    publishedAt: row.publishedAt,
    revision: row.revision,
    updatedAt: row.updatedAt,
  };
}

function parseStored(value: unknown): RichTextDoc | null {
  try {
    return parseRichText(value);
  } catch {
    return null;
  }
}

/** Every policy kind, in display order, with its draft and status. */
export async function listPolicies(ctx: TenantContext): Promise<StorePolicyView[]> {
  return inStore(ctx, "store.read", async (tx) => {
    const rows = (await tx.storePolicy.findMany()) as PolicyRow[];
    return POLICY_DEFINITIONS.map((d) =>
      view(
        d.kind,
        rows.find((r) => r.kind === d.kind),
      ),
    );
  });
}

export async function getPolicy(ctx: TenantContext, kind: unknown): Promise<StorePolicyView> {
  const k = policyKind(kind);
  return inStore(ctx, "store.read", async (tx) => {
    const row = (await tx.storePolicy.findFirst({ where: { kind: k } })) as PolicyRow | null;
    return view(k, row ?? undefined);
  });
}

function policyKind(value: unknown): StorePolicyKind {
  if (!isPolicyKind(value)) throw validationFailed({ kind: "Choose a policy." });
  return value;
}

/**
 * A starter document: the definition's section headings only, so the
 * merchant sees a structure to fill. It carries no policy text, and a
 * document of headings alone can't be published.
 */
export function policyStarter(kind: StorePolicyKind): RichTextDoc {
  return {
    type: "doc",
    content: policyDefinition(kind).starterHeadings.map((heading) => ({
      type: "heading" as const,
      attrs: { level: 2 as const },
      content: [{ type: "text" as const, text: heading }],
    })),
  };
}

/** The policy's own words: its text outside headings (a starter has none). */
export function policyBodyText(doc: RichTextDoc | null): string {
  if (!doc) return "";
  return richTextToPlainText({
    type: "doc",
    content: (doc.content ?? []).filter((node) => node.type !== "heading"),
  });
}

const MIN_BODY_CHARACTERS = 20;

function parseTitle(value: unknown, kind: StorePolicyKind): string {
  const title =
    (typeof value === "string" ? value.trim() : "") || policyDefinition(kind).defaultTitle;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(title) || title.length > 120) {
    throw validationFailed({ title: "Use a title of up to 120 characters." });
  }
  return title;
}

function parseBody(value: unknown): RichTextDoc | null {
  try {
    return parseRichText(value);
  } catch (error) {
    if (error instanceof RichTextError) throw validationFailed({ body: error.message });
    throw error;
  }
}

/**
 * Saves a policy's draft (title and body). `revision` is the one the editor
 * loaded; a save against an older one is refused. Returns the new revision.
 */
export async function savePolicyDraft(
  ctx: TenantContext,
  kind: unknown,
  input: { readonly title?: unknown; readonly body?: unknown; readonly revision?: unknown },
): Promise<{ readonly revision: number; readonly status: PolicyStatus }> {
  const k = policyKind(kind);
  const title = parseTitle(input.title, k);
  const body = parseBody(input.body);
  const revision = Number(input.revision ?? 0);
  if (!Number.isInteger(revision) || revision < 0) throw validationFailed({ revision: "Reload." });
  return inStore(
    ctx,
    "store.update",
    async (tx, store) => {
      const json = body === null ? Prisma.DbNull : (body as unknown as Prisma.InputJsonValue);
      const existing = await tx.storePolicy.findFirst({ where: { kind: k } });
      let row: PolicyRow;
      if (!existing) {
        if (revision !== 0) throw staleDraft();
        row = await tx.storePolicy.create({
          data: {
            organisationId: store.organisationId,
            storeId: store.storeId,
            kind: k,
            title,
            bodyDoc: json,
            revision: 1,
            updatedById: store.userId,
          },
        });
      } else {
        const { count } = await tx.storePolicy.updateMany({
          where: { id: existing.id, revision },
          data: { title, bodyDoc: json, revision: revision + 1, updatedById: store.userId },
        });
        if (count === 0) throw staleDraft();
        row = await tx.storePolicy.findFirstOrThrow({ where: { id: existing.id } });
      }
      await recordAudit(
        tx,
        store,
        "store.policy_saved",
        { type: "Store", id: store.storeId },
        {
          kind: k,
        },
      );
      return { revision: row.revision, status: statusOf(row) };
    },
    { write: true },
  );
}

const staleDraft = () =>
  conflict("This policy was changed somewhere else. Reload to see the latest version.");

/**
 * Publishes the saved draft (at `revision`) as the policy shoppers see. A
 * draft without text of its own (only starter headings, or nothing) is
 * refused.
 */
export async function publishPolicy(
  ctx: TenantContext,
  kind: unknown,
  input: { readonly revision?: unknown },
): Promise<{ readonly revision: number }> {
  const k = policyKind(kind);
  const revision = Number(input.revision ?? -1);
  return inStore(
    ctx,
    "store.update",
    async (tx, store) => {
      const row = await tx.storePolicy.findFirst({ where: { kind: k } });
      if (row?.revision !== revision) throw staleDraft();
      const body = parseStored(row.bodyDoc);
      if (policyBodyText(body).length < MIN_BODY_CHARACTERS) {
        throw validationFailed({
          body: "Write the policy before publishing it: the starter headings aren't a policy on their own.",
        });
      }
      const { count } = await tx.storePolicy.updateMany({
        where: { id: row.id, revision },
        data: {
          publishedTitle: row.title,
          publishedDoc: body as unknown as Prisma.InputJsonValue,
          publishedAt: new Date(),
          revision: revision + 1,
          updatedById: store.userId,
        },
      });
      if (count === 0) throw staleDraft();
      await recordAudit(
        tx,
        store,
        "store.policy_published",
        { type: "Store", id: store.storeId },
        {
          kind: k,
        },
      );
      return { revision: revision + 1 };
    },
    { write: true },
  );
}

/** Takes a policy off the storefront (the draft stays). */
export async function unpublishPolicy(ctx: TenantContext, kind: unknown): Promise<void> {
  const k = policyKind(kind);
  await inStore(
    ctx,
    "store.update",
    async (tx, store) => {
      const row = await tx.storePolicy.findFirst({ where: { kind: k } });
      if (row?.publishedDoc == null) return;
      await tx.storePolicy.update({
        where: { id: row.id },
        data: {
          publishedTitle: null,
          publishedDoc: Prisma.DbNull,
          publishedAt: null,
          revision: row.revision + 1,
          updatedById: store.userId,
        },
      });
      await recordAudit(
        tx,
        store,
        "store.policy_unpublished",
        { type: "Store", id: store.storeId },
        { kind: k },
      );
    },
    { write: true },
  );
}
