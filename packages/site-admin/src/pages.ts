import "server-only";
import { Prisma } from "@storevia/database";
import {
  describeIssues,
  problemText,
  problemsSummary,
  upgradeDocument,
  validateDocument,
  type PageDocument,
  type ValidationIssue,
} from "@storevia/editor/document";
import type { SiteRenderContext } from "@storevia/editor/registry";
import { SITE_HOME_DOCUMENT, contentPageDocument } from "@storevia/editor/templates";
import { assertFeature } from "@storevia/entitlements";
import { isFeatureKey } from "@storevia/entitlements/features";
import { createLogger, recordMetric } from "@storevia/observability";
import { parseInput, recordAudit, type StoreContext, type TenantContext } from "@storevia/tenancy";
import { DomainError, notFound, toTypeId } from "@storevia/types";
import { z } from "zod";
import type { SiteComposition } from "./composition";
import {
  conflict,
  inSite,
  internalId,
  invalid,
  lockStoreKey,
  pgCode,
  type TenantTx,
} from "./internal";
import { DRAFT_CONFLICT_MESSAGE } from "./messages";
import { documentReferences, missingReferences } from "./references";

// Pages and their versions (ADR-0030 §5, 07 §9). A page has at most one
// DRAFT and one PUBLISHED version; published documents are frozen by
// trigger. Opening the builder copies the published document into a draft;
// saving checks the draft's revision (optimistic concurrency) so two tabs
// or two people never silently overwrite each other; publishing archives
// the old version, publishes the draft, moves the page's pointer and starts
// the next draft as a copy of what went live, in one transaction (the
// deferred pointer trigger refuses anything half-done). A revision is never
// issued twice for a page (nextRevision), so a stale tab can't match a
// newer draft. Reverting copies the published document back into the
// draft. Every document is validated against the composition's registry
// and every id it names is checked against this store before it is stored.

const log = createLogger({ component: "site-admin" });

/** The builder edits these kinds; product/collection/search templates keep their code defaults (M5). */
export const EDITABLE_PAGE_KINDS = ["HOME", "STANDARD"] as const;
export type EditablePageKind = (typeof EDITABLE_PAGE_KINDS)[number];

export const PAGE_LIMITS = { maxStandardPages: 100, maxTitle: 255, maxHandle: 100 } as const;

const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Handles no content page may take (the home page's own, and the ones that read as routes). */
const RESERVED_HANDLES = new Set([
  "home",
  "cart",
  "search",
  "products",
  "collections",
  "pages",
  "sitemap-xml",
]);

export type PageStatus = "published" | "draft" | "changes";

export interface PageSummary {
  readonly id: string;
  readonly kind: EditablePageKind;
  readonly title: string;
  readonly handle: string;
  /** published: live, no pending changes; changes: live with unpublished changes; draft: never published or unpublished. */
  readonly status: PageStatus;
  readonly updatedAt: Date;
}

export interface PageDraft {
  readonly id: string;
  readonly kind: EditablePageKind;
  readonly title: string;
  readonly handle: string;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly live: boolean;
  readonly status: PageStatus;
  readonly revision: number;
  readonly versionNumber: number;
  readonly document: PageDocument;
  /** Problems with the stored draft (e.g. a block that no longer exists); the builder shows them. */
  readonly problems: readonly string[];
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

interface PageRow {
  id: string;
  kind: EditablePageKind;
  title: string;
  handle: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedVersionId: string | null;
}

async function loadPage(tx: TenantTx, pageId: string, lock = false): Promise<PageRow> {
  const rows = await tx.$queryRaw<PageRow[]>`
    SELECT id, kind::text AS kind, title, handle, "seoTitle", "seoDescription", "publishedVersionId"
    FROM "Page"
    WHERE id = ${pageId}::uuid AND "deletedAt" IS NULL AND kind IN ('HOME', 'STANDARD')
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

const statusOf = (
  published: string | null,
  draftHash: string | null,
  publishedHash: string | null,
): PageStatus =>
  !published
    ? "draft"
    : draftHash !== null && draftHash !== publishedHash
      ? "changes"
      : "published";

function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PAGE_LIMITS.maxHandle)
    .replace(/-+$/g, "");
  return slug || "page";
}

/** The most problems one refusal carries (the builder lists them). */
const MAX_REPORTED_PROBLEMS = 50;

/**
 * A refused document: the message names each problem's section and field
 * in words; `fieldErrors` carries the same problems keyed by their path in
 * the document, so the builder can show each one at its field.
 */
function invalidDocument<C extends SiteRenderContext>(
  document: unknown,
  issues: readonly ValidationIssue[],
  composition: SiteComposition<C>,
): DomainError {
  const problems = describeIssues(document, issues, composition.registry);
  const fieldErrors: Record<string, string> = {};
  for (const problem of problems.slice(0, MAX_REPORTED_PROBLEMS)) {
    fieldErrors[problem.path.startsWith("root.") ? problem.path : "document"] ??= problem.message;
  }
  return invalid(`This page can't be saved. ${problemsSummary(problems)}`, fieldErrors);
}

/**
 * Validates a document for a page kind and checks every reference against
 * this store. Throws VALIDATION_FAILED (logged by count, never content).
 */
async function checkedDocument<C extends SiteRenderContext>(
  tx: TenantTx,
  store: StoreContext,
  composition: SiteComposition<C>,
  kind: EditablePageKind,
  input: unknown,
  pageId: string,
): Promise<{ document: PageDocument; sections: number }> {
  const upgraded = upgradeDocument(input);
  const result = validateDocument(upgraded, {
    registry: composition.registry,
    pageKind: kind,
  });
  if (!result.ok) {
    log.warn("page validation failed", {
      storeId: store.storeId,
      kind,
      issues: result.issues.length,
    });
    recordMetric("site.page_validation_failed", 1, { kind });
    throw invalidDocument(upgraded, result.issues, composition);
  }
  for (const feature of result.requiredFeatures) {
    if (isFeatureKey(feature)) await assertFeature(tx, store.organisationId, feature);
  }
  const problems = await missingReferences(
    tx,
    composition,
    documentReferences(result.document, composition),
    pageId,
  );
  if (problems.length > 0) {
    log.warn("page references refused", {
      storeId: store.storeId,
      kind,
      problems: problems.length,
    });
    recordMetric("site.page_validation_failed", 1, { kind });
    throw invalid(`This page can't be saved: ${problems.join(" ")}`);
  }
  return { document: result.document, sections: result.document.root.length };
}

const titleSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1, "Give the page a title.").max(PAGE_LIMITS.maxTitle));
const handleSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .max(PAGE_LIMITS.maxHandle)
      .regex(HANDLE_RE, "Use lowercase letters, numbers and single hyphens."),
  );
const seoSchema = (max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(max))
    .transform((v) => (v === "" ? null : v));

async function requireFreeHandle(tx: TenantTx, handle: string, except?: string): Promise<void> {
  if (RESERVED_HANDLES.has(handle)) {
    throw new DomainError("VALIDATION_FAILED", "Please correct the highlighted fields.", {
      handle: "That address is reserved. Choose another.",
    });
  }
  const taken = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Page" WHERE handle = ${handle} AND "deletedAt" IS NULL
      AND (${except ?? null}::uuid IS NULL OR id <> ${except ?? null}::uuid)`;
  if (taken.length > 0) {
    throw new DomainError("VALIDATION_FAILED", "Please correct the highlighted fields.", {
      handle: "Another page already uses this address.",
    });
  }
}

const handleConflict = () =>
  new DomainError("VALIDATION_FAILED", "Please correct the highlighted fields.", {
    handle: "Another page already uses this address.",
  });

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

export async function listPages(ctx: TenantContext): Promise<PageSummary[]> {
  return inSite(ctx, "design.edit", async (tx) => {
    const rows = await tx.$queryRaw<
      (Omit<PageRow, "seoTitle" | "seoDescription"> & {
        updatedAt: Date;
        publishedHash: string | null;
        draftHash: string | null;
      })[]
    >`
      SELECT p.id, p.kind::text AS kind, p.title, p.handle, p."publishedVersionId",
             greatest(p."updatedAt", coalesce(d."updatedAt", p."updatedAt")) AS "updatedAt",
             pub."documentHash" AS "publishedHash", d."documentHash" AS "draftHash"
      FROM "Page" p
      LEFT JOIN "PageVersion" pub ON pub.id = p."publishedVersionId"
      LEFT JOIN "PageVersion" d ON d."pageId" = p.id AND d.state = 'DRAFT'
      WHERE p."deletedAt" IS NULL AND p.kind IN ('HOME', 'STANDARD')
      ORDER BY (p.kind = 'HOME') DESC, lower(p.title), p.id`;
    return rows.map((row) => ({
      id: toTypeId("page", row.id),
      kind: row.kind,
      title: row.title,
      handle: row.handle,
      status: statusOf(row.publishedVersionId, row.draftHash, row.publishedHash),
      updatedAt: row.updatedAt,
    }));
  });
}

// ---------------------------------------------------------------------------
// Create and settings.
// ---------------------------------------------------------------------------

const createSchema = z.strictObject({ title: titleSchema, handle: handleSchema.optional() });

export async function createPage(ctx: TenantContext, input: unknown): Promise<{ pageId: string }> {
  const data = parseInput(createSchema, input);
  return inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      await lockStoreKey(tx, store.storeId, "page-handle");
      const [count] = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "Page" WHERE kind = 'STANDARD' AND "deletedAt" IS NULL`;
      if ((count?.n ?? 0) >= PAGE_LIMITS.maxStandardPages) {
        throw conflict(`A store can have at most ${String(PAGE_LIMITS.maxStandardPages)} pages.`);
      }
      const handle = data.handle ?? slugify(data.title);
      await requireFreeHandle(tx, handle);
      const document = contentPageDocument(data.title);
      const json = JSON.stringify(document);
      try {
        const [page] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "Page" (id, "organisationId", "storeId", kind, title, handle, "updatedAt")
          VALUES (gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid, 'STANDARD',
                  ${data.title}, ${handle}, now())
          RETURNING id`;
        if (!page) throw new Error("page insert returned nothing");
        await tx.$executeRaw`
          INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state,
              "schemaVersion", document, "documentHash", "createdById", "updatedById", "updatedAt")
          VALUES (gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid, ${page.id}::uuid,
                  1, 'DRAFT', 1, ${json}::jsonb, encode(sha256(convert_to(${json}::jsonb::text, 'UTF8')), 'hex'),
                  ${store.userId}::uuid, ${store.userId}::uuid, now())`;
        await recordAudit(
          tx,
          store,
          "page.created",
          { type: "Page", id: page.id },
          { title: data.title, handle },
        );
        return { pageId: toTypeId("page", page.id) };
      } catch (error) {
        if (pgCode(error) === "23505") throw handleConflict();
        throw error;
      }
    },
    { write: true },
  );
}

const settingsSchema = z.strictObject({
  title: titleSchema,
  handle: handleSchema,
  seoTitle: seoSchema(255),
  seoDescription: seoSchema(1_000),
});

/** Title, address and search settings (they apply immediately; the page's content goes through publish). */
export async function updatePageSettings(
  ctx: TenantContext,
  pageIdInput: unknown,
  input: unknown,
): Promise<void> {
  const pageId = internalId("page", pageIdInput);
  const data = parseInput(settingsSchema, input);
  await inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      await lockStoreKey(tx, store.storeId, "page-handle");
      const page = await loadPage(tx, pageId, true);
      // The home page's address is the site's root; its handle never changes.
      const handle = page.kind === "HOME" ? page.handle : data.handle;
      if (handle !== page.handle) await requireFreeHandle(tx, handle, pageId);
      try {
        await tx.$executeRaw`
          UPDATE "Page" SET title = ${data.title}, handle = ${handle}, "seoTitle" = ${data.seoTitle},
                 "seoDescription" = ${data.seoDescription}, "updatedAt" = now()
          WHERE id = ${pageId}::uuid`;
      } catch (error) {
        if (pgCode(error) === "23505") throw handleConflict();
        throw error;
      }
      await recordAudit(
        tx,
        store,
        "page.settings_changed",
        { type: "Page", id: pageId },
        {
          title: data.title,
          handle,
          previousHandle: page.handle,
        },
      );
    },
    { write: true },
  );
}

// ---------------------------------------------------------------------------
// Drafts.
// ---------------------------------------------------------------------------

interface VersionRow {
  id: string;
  revision: number;
  versionNumber: number;
  document: unknown;
  documentHash: string;
}

async function draftOf(tx: TenantTx, pageId: string): Promise<VersionRow | null> {
  const rows = await tx.$queryRaw<VersionRow[]>`
    SELECT id, revision, "versionNumber", document, "documentHash" FROM "PageVersion"
    WHERE "pageId" = ${pageId}::uuid AND state = 'DRAFT'`;
  return rows[0] ?? null;
}

async function publishedOf(
  tx: TenantTx,
  page: PageRow,
): Promise<Omit<VersionRow, "id" | "revision"> | null> {
  if (!page.publishedVersionId) return null;
  const rows = await tx.$queryRaw<Omit<VersionRow, "id" | "revision">[]>`
    SELECT "versionNumber", document, "documentHash" FROM "PageVersion"
    WHERE id = ${page.publishedVersionId}::uuid`;
  return rows[0] ?? null;
}

/**
 * The revision a new draft starts at: past every revision any version of the
 * page ever had. A revision is the builder's concurrency token, so it is
 * never issued twice for one page: a tab still holding the old draft's
 * revision can't save over a draft created later (after a publish), even
 * though that draft is a different row.
 */
const nextRevision = (pageId: string) => Prisma.sql`(
  SELECT coalesce(max(revision), -1) + 1 FROM "PageVersion" WHERE "pageId" = ${pageId}::uuid)`;

/** The editor's copy of a stored document (the kind's starter when it can't be read). */
function documentForEditor<C extends SiteRenderContext>(
  composition: SiteComposition<C>,
  kind: EditablePageKind,
  stored: unknown,
): { document: PageDocument; problems: string[] } {
  const upgraded = upgradeDocument(stored);
  const result = validateDocument(upgraded, { registry: composition.registry, pageKind: kind });
  if (result.ok) return { document: result.document, problems: [] };
  return {
    document: (upgraded as PageDocument | null) ?? { schemaVersion: 1, root: [] },
    problems: describeIssues(upgraded, result.issues, composition.registry)
      .slice(0, 10)
      .map(problemText),
  };
}

/**
 * The page's draft for the builder, created from the published version (or
 * the kind's starter document) when there is none. Two tabs opening at once
 * share the one draft (the partial unique index decides).
 */
export async function openPageDraft<C extends SiteRenderContext>(
  ctx: TenantContext,
  pageIdInput: unknown,
  composition: SiteComposition<C>,
): Promise<PageDraft> {
  const pageId = internalId("page", pageIdInput);
  return inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      const page = await loadPage(tx, pageId);
      let draft = await draftOf(tx, pageId);
      if (!draft) {
        const published = page.publishedVersionId
          ? (
              await tx.$queryRaw<{ document: unknown }[]>`
                SELECT document FROM "PageVersion" WHERE id = ${page.publishedVersionId}::uuid`
            )[0]
          : undefined;
        const source =
          (published ? upgradeDocument(published.document) : null) ??
          (page.kind === "HOME" ? SITE_HOME_DOCUMENT : contentPageDocument(page.title));
        const json = JSON.stringify(source);
        await tx.$executeRaw`
          INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state,
              "schemaVersion", document, "documentHash", revision, "basedOnVersionId", "createdById",
              "updatedById", "updatedAt")
          SELECT gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid, ${pageId}::uuid,
                 coalesce(max("versionNumber"), 0) + 1, 'DRAFT', 1, ${json}::jsonb,
                 encode(sha256(convert_to(${json}::jsonb::text, 'UTF8')), 'hex'),
                 coalesce(max(revision), -1) + 1,
                 ${page.publishedVersionId}::uuid, ${store.userId}::uuid, ${store.userId}::uuid, now()
          FROM "PageVersion" WHERE "pageId" = ${pageId}::uuid
          ON CONFLICT ("pageId") WHERE state = 'DRAFT' DO NOTHING`;
        draft = await draftOf(tx, pageId);
        if (!draft) throw new Error("draft missing after insert");
      }
      const publishedHash = (await publishedOf(tx, page))?.documentHash ?? null;
      const { document, problems } = documentForEditor(composition, page.kind, draft.document);
      return {
        id: toTypeId("page", page.id),
        kind: page.kind,
        title: page.title,
        handle: page.handle,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        live: page.publishedVersionId !== null,
        status: statusOf(page.publishedVersionId, draft.documentHash, publishedHash),
        revision: draft.revision,
        versionNumber: draft.versionNumber,
        document,
        problems,
      };
    },
    { write: true },
  );
}

const saveSchema = z.strictObject({
  revision: z.number().int().min(0),
  document: z.unknown(),
});

export { DRAFT_CONFLICT_MESSAGE };

/** Saves the draft if nobody else saved since `revision`; returns the new revision. */
export async function savePageDraft<C extends SiteRenderContext>(
  ctx: TenantContext,
  pageIdInput: unknown,
  input: unknown,
  composition: SiteComposition<C>,
): Promise<{ revision: number; status: PageStatus }> {
  const pageId = internalId("page", pageIdInput);
  const data = parseInput(saveSchema, input);
  try {
    return await inSite(
      ctx,
      "design.edit",
      async (tx, store) => {
        const page = await loadPage(tx, pageId);
        const { document } = await checkedDocument(
          tx,
          store,
          composition,
          page.kind,
          data.document,
          pageId,
        );
        const json = JSON.stringify(document);
        const updated = await tx.$queryRaw<{ revision: number; documentHash: string }[]>`
        UPDATE "PageVersion"
        SET document = ${json}::jsonb,
            "documentHash" = encode(sha256(convert_to(${json}::jsonb::text, 'UTF8')), 'hex'),
            revision = revision + 1, "updatedById" = ${store.userId}::uuid, "updatedAt" = now()
        WHERE "pageId" = ${pageId}::uuid AND state = 'DRAFT' AND revision = ${data.revision}
        RETURNING revision, "documentHash"`;
        const row = updated[0];
        if (!row) {
          recordMetric("site.draft_conflict", 1, {});
          throw conflict(DRAFT_CONFLICT_MESSAGE);
        }
        const publishedHash = page.publishedVersionId
          ? ((
              await tx.$queryRaw<{ documentHash: string }[]>`
              SELECT "documentHash" FROM "PageVersion" WHERE id = ${page.publishedVersionId}::uuid`
            )[0]?.documentHash ?? null)
          : null;
        return {
          revision: row.revision,
          status: statusOf(page.publishedVersionId, row.documentHash, publishedHash),
        };
      },
      { write: true },
    );
  } catch (error) {
    // Refusals (conflict, validation, permission) are expected; anything
    // else is a failed save the merchant sees as an error.
    if (!(error instanceof DomainError)) {
      log.error("page draft save failed", { pageId, error });
      recordMetric("site.draft_save_failed", 1, {});
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Publish, unpublish, delete.
// ---------------------------------------------------------------------------

const revisionSchema = z.strictObject({ revision: z.number().int().min(0) });

export interface PublishResult {
  /** The version that is live now. */
  readonly versionNumber: number;
  /** The draft's revision after publishing: the builder keeps editing with it. */
  readonly revision: number;
  /** False when the draft was already what's live (nothing was published). */
  readonly changed: boolean;
}

/**
 * Publishes the draft the merchant is looking at (`revision`): one
 * transaction archives the live version, publishes the draft, moves the
 * page's pointer and starts a new draft from what was just published (so
 * the builder keeps editing without a reload). A failure anywhere leaves
 * the live page as it was. A draft that is already live publishes nothing.
 */
export async function publishPage<C extends SiteRenderContext>(
  ctx: TenantContext,
  pageIdInput: unknown,
  input: unknown,
  composition: SiteComposition<C>,
): Promise<PublishResult> {
  const pageId = internalId("page", pageIdInput);
  const data = parseInput(revisionSchema, input);
  try {
    return await inSite(
      ctx,
      "page.publish",
      async (tx, store) => {
        const page = await loadPage(tx, pageId, true);
        const draft = await draftOf(tx, pageId);
        // No draft: it was published from somewhere else (before drafts
        // outlived a publish), so this tab's revision is stale.
        if (draft?.revision !== data.revision) throw conflict(DRAFT_CONFLICT_MESSAGE);
        const live = await publishedOf(tx, page);
        if (live?.documentHash === draft.documentHash) {
          return { versionNumber: live.versionNumber, revision: draft.revision, changed: false };
        }
        const { sections } = await checkedDocument(
          tx,
          store,
          composition,
          page.kind,
          draft.document,
          pageId,
        );
        if (page.publishedVersionId) {
          await tx.$executeRaw`
            UPDATE "PageVersion" SET state = 'ARCHIVED', "updatedAt" = now()
            WHERE id = ${page.publishedVersionId}::uuid AND state = 'PUBLISHED'`;
        }
        await tx.$executeRaw`
          UPDATE "PageVersion" SET state = 'PUBLISHED', "publishedAt" = now(),
                 "publishedById" = ${store.userId}::uuid, "updatedAt" = now()
          WHERE id = ${draft.id}::uuid AND state = 'DRAFT'`;
        await tx.$executeRaw`
          UPDATE "Page" SET "publishedVersionId" = ${draft.id}::uuid, "updatedAt" = now()
          WHERE id = ${pageId}::uuid`;
        // The next draft: a copy of what was just published, with a revision
        // no version of this page has had (see nextRevision).
        const [next] = await tx.$queryRaw<{ revision: number }[]>`
          INSERT INTO "PageVersion" (id, "organisationId", "storeId", "pageId", "versionNumber", state,
              "schemaVersion", document, "documentHash", revision, "basedOnVersionId", "createdById",
              "updatedById", "updatedAt")
          SELECT gen_random_uuid(), v."organisationId", v."storeId", v."pageId",
                 (SELECT max("versionNumber") + 1 FROM "PageVersion" WHERE "pageId" = v."pageId"),
                 'DRAFT', v."schemaVersion", v.document, v."documentHash",
                 ${nextRevision(pageId)}, v.id, ${store.userId}::uuid, ${store.userId}::uuid, now()
          FROM "PageVersion" v WHERE v.id = ${draft.id}::uuid
          RETURNING revision`;
        if (!next) throw new Error("next draft insert returned nothing");
        await recordAudit(
          tx,
          store,
          "page.published",
          { type: "Page", id: pageId },
          {
            kind: page.kind,
            versionNumber: draft.versionNumber,
            sections,
          },
        );
        return { versionNumber: draft.versionNumber, revision: next.revision, changed: true };
      },
      { write: true },
    );
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("page publish failed", { pageId, error });
      recordMetric("site.publish_failed", 1, {});
    }
    throw error;
  }
}

export interface RevertResult {
  readonly revision: number;
  readonly status: PageStatus;
  readonly document: PageDocument;
  readonly problems: readonly string[];
}

/**
 * Throws away the draft's unpublished changes: the draft (at `revision`)
 * becomes a copy of the published version again. The published version is
 * never touched; a draft saved elsewhere since `revision` is refused like
 * any other stale save.
 */
export async function revertPageDraft<C extends SiteRenderContext>(
  ctx: TenantContext,
  pageIdInput: unknown,
  input: unknown,
  composition: SiteComposition<C>,
): Promise<RevertResult> {
  const pageId = internalId("page", pageIdInput);
  const data = parseInput(revisionSchema, input);
  return inSite(
    ctx,
    "design.edit",
    async (tx, store) => {
      const page = await loadPage(tx, pageId);
      const live = await publishedOf(tx, page);
      if (!live)
        throw conflict("This page hasn't been published yet, so there's nothing to go back to.");
      const draft = await draftOf(tx, pageId);
      if (draft?.revision !== data.revision) throw conflict(DRAFT_CONFLICT_MESSAGE);
      let revision = draft.revision;
      if (draft.documentHash !== live.documentHash) {
        const [row] = await tx.$queryRaw<{ revision: number }[]>`
          UPDATE "PageVersion" d
          SET document = p.document, "documentHash" = p."documentHash", "schemaVersion" = p."schemaVersion",
              revision = ${nextRevision(pageId)}, "basedOnVersionId" = p.id,
              "updatedById" = ${store.userId}::uuid, "updatedAt" = now()
          FROM "PageVersion" p
          WHERE p.id = ${page.publishedVersionId}::uuid
            AND d."pageId" = ${pageId}::uuid AND d.state = 'DRAFT' AND d.revision = ${data.revision}
          RETURNING d.revision`;
        if (!row) {
          recordMetric("site.draft_conflict", 1, {});
          throw conflict(DRAFT_CONFLICT_MESSAGE);
        }
        revision = row.revision;
        await recordAudit(
          tx,
          store,
          "page.draft_reverted",
          { type: "Page", id: pageId },
          { kind: page.kind, versionNumber: live.versionNumber },
        );
      }
      const { document, problems } = documentForEditor(composition, page.kind, live.document);
      return { revision, status: "published", document, problems };
    },
    { write: true },
  );
}

async function takeDown(tx: TenantTx, page: PageRow): Promise<void> {
  if (!page.publishedVersionId) return;
  await tx.$executeRaw`UPDATE "Page" SET "publishedVersionId" = NULL, "updatedAt" = now() WHERE id = ${page.id}::uuid`;
  await tx.$executeRaw`
    UPDATE "PageVersion" SET state = 'ARCHIVED', "updatedAt" = now()
    WHERE id = ${page.publishedVersionId}::uuid AND state = 'PUBLISHED'`;
}

/** Takes a content page off the site (its draft stays). The home page can't be unpublished. */
export async function unpublishPage(ctx: TenantContext, pageIdInput: unknown): Promise<void> {
  const pageId = internalId("page", pageIdInput);
  await inSite(
    ctx,
    "page.publish",
    async (tx, store) => {
      const page = await loadPage(tx, pageId, true);
      if (page.kind === "HOME") throw conflict("The home page is always published.");
      await takeDown(tx, page);
      await recordAudit(
        tx,
        store,
        "page.unpublished",
        { type: "Page", id: pageId },
        { handle: page.handle },
      );
    },
    { write: true },
  );
}

/** Deletes a content page: it leaves the site at once, and links to it render as nothing. */
export async function deletePage(ctx: TenantContext, pageIdInput: unknown): Promise<void> {
  const pageId = internalId("page", pageIdInput);
  await inSite(
    ctx,
    "page.publish",
    async (tx, store) => {
      const page = await loadPage(tx, pageId, true);
      if (page.kind === "HOME") throw conflict("The home page can't be deleted.");
      await takeDown(tx, page);
      await tx.$executeRaw`UPDATE "Page" SET "deletedAt" = now(), "updatedAt" = now() WHERE id = ${pageId}::uuid`;
      await recordAudit(
        tx,
        store,
        "page.deleted",
        { type: "Page", id: pageId },
        { title: page.title, handle: page.handle },
      );
    },
    { write: true },
  );
}
