import "server-only";
import { Prisma } from "@storevia/database";
import {
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
import { documentReferences, missingReferences } from "./references";

// Pages and their versions (ADR-0030 §5, 07 §9). A page has at most one
// DRAFT and one PUBLISHED version; published documents are frozen by
// trigger. Opening the builder copies the published document into a draft;
// saving checks the draft's revision (optimistic concurrency) so two tabs
// or two people never silently overwrite each other; publishing archives
// the old version, publishes the draft and moves the page's pointer in one
// transaction (the deferred pointer trigger refuses anything half-done).
// Every document is validated against the composition's registry and every
// id it names is checked against this store before it is stored.

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

function issuesMessage(issues: readonly ValidationIssue[]): string {
  const first = issues.slice(0, 3).map((i) => (i.path ? `${i.path}: ${i.message}` : i.message));
  const more = issues.length > 3 ? ` (and ${String(issues.length - 3)} more)` : "";
  return `This page can't be saved: ${first.join("; ")}${more}`;
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
  const result = validateDocument(upgradeDocument(input), {
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
    throw invalid(issuesMessage(result.issues));
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
              "schemaVersion", document, "documentHash", "basedOnVersionId", "createdById", "updatedById", "updatedAt")
          SELECT gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid, ${pageId}::uuid,
                 coalesce(max("versionNumber"), 0) + 1, 'DRAFT', 1, ${json}::jsonb,
                 encode(sha256(convert_to(${json}::jsonb::text, 'UTF8')), 'hex'),
                 ${page.publishedVersionId}::uuid, ${store.userId}::uuid, ${store.userId}::uuid, now()
          FROM "PageVersion" WHERE "pageId" = ${pageId}::uuid
          ON CONFLICT ("pageId") WHERE state = 'DRAFT' DO NOTHING`;
        draft = await draftOf(tx, pageId);
        if (!draft) throw new Error("draft missing after insert");
      }
      const publishedHash = page.publishedVersionId
        ? ((
            await tx.$queryRaw<{ documentHash: string }[]>`
              SELECT "documentHash" FROM "PageVersion" WHERE id = ${page.publishedVersionId}::uuid`
          )[0]?.documentHash ?? null)
        : null;
      const upgraded = upgradeDocument(draft.document);
      const result = validateDocument(upgraded, {
        registry: composition.registry,
        pageKind: page.kind,
      });
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
        document: result.ok
          ? result.document
          : ((upgraded as PageDocument | null) ?? { schemaVersion: 1, root: [] }),
        problems: result.ok ? [] : result.issues.slice(0, 10).map((i) => `${i.path}: ${i.message}`),
      };
    },
    { write: true },
  );
}

const saveSchema = z.strictObject({
  revision: z.number().int().min(0),
  document: z.unknown(),
});

export const DRAFT_CONFLICT_MESSAGE =
  "This page was saved somewhere else (another tab, device or person) after you opened it. Reload to see the latest version; copy anything you want to keep first.";

/** Saves the draft if nobody else saved since `revision`; returns the new revision. */
export async function savePageDraft<C extends SiteRenderContext>(
  ctx: TenantContext,
  pageIdInput: unknown,
  input: unknown,
  composition: SiteComposition<C>,
): Promise<{ revision: number; status: PageStatus }> {
  const pageId = internalId("page", pageIdInput);
  const data = parseInput(saveSchema, input);
  return inSite(
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
}

// ---------------------------------------------------------------------------
// Publish, unpublish, delete.
// ---------------------------------------------------------------------------

const publishSchema = z.strictObject({ revision: z.number().int().min(0) });

/**
 * Publishes the draft the merchant is looking at (`revision`): one
 * transaction archives the live version, publishes the draft and moves the
 * page's pointer. A failure anywhere leaves the live page as it was.
 */
export async function publishPage<C extends SiteRenderContext>(
  ctx: TenantContext,
  pageIdInput: unknown,
  input: unknown,
  composition: SiteComposition<C>,
): Promise<{ versionNumber: number }> {
  const pageId = internalId("page", pageIdInput);
  const data = parseInput(publishSchema, input);
  try {
    return await inSite(
      ctx,
      "page.publish",
      async (tx, store) => {
        const page = await loadPage(tx, pageId, true);
        const draft = await draftOf(tx, pageId);
        if (!draft) throw conflict("There's nothing new to publish on this page.");
        if (draft.revision !== data.revision) throw conflict(DRAFT_CONFLICT_MESSAGE);
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
        return { versionNumber: draft.versionNumber };
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
