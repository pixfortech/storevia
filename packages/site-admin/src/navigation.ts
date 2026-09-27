import "server-only";
import {
  NAVIGATION_HANDLES,
  navigationItemsSchema,
  usableNavigationItems,
  type NavigationHandle,
  type NavigationItem,
} from "@storevia/editor/navigation";
import type { SiteRenderContext } from "@storevia/editor/registry";
import { parseInput, recordAudit, type TenantContext } from "@storevia/tenancy";
import { DomainError, notFound } from "@storevia/types";
import { z } from "zod";
import type { SiteComposition } from "./composition";
import { conflict, inSite, invalid, pgCode } from "./internal";
import { menuReferences, missingReferences } from "./references";

// Menus (ADR-0030 §8): a store's header ("main") and footer menus, each a
// validated list of labelled typed links saved with optimistic concurrency.
// Changes are live at once (navigation.changed invalidates the site).

export interface MenuView {
  readonly handle: NavigationHandle;
  readonly items: readonly NavigationItem[];
  readonly revision: number;
  /** False until the store saves this menu (the header then lists collections, as in M4). */
  readonly saved: boolean;
}

const TITLES: Record<NavigationHandle, string> = { main: "Main menu", footer: "Footer menu" };

export async function getMenus<C extends SiteRenderContext>(
  ctx: TenantContext,
  composition: SiteComposition<C>,
): Promise<MenuView[]> {
  return inSite(ctx, "navigation.manage", async (tx) => {
    const rows = await tx.$queryRaw<
      { handle: NavigationHandle; items: unknown; revision: number }[]
    >`
      SELECT handle, items, revision FROM "Navigation"`;
    return NAVIGATION_HANDLES.map((handle) => {
      const row = rows.find((r) => r.handle === handle);
      return {
        handle,
        items: row ? usableNavigationItems(row.items, composition.registry.linkSchema) : [],
        revision: row?.revision ?? 0,
        saved: row !== undefined,
      };
    });
  });
}

const MENU_CONFLICT =
  "This menu was changed somewhere else (another tab, device or person) after you opened it. Reload to see the latest version.";

const saveSchema = z.strictObject({ revision: z.number().int().min(0), items: z.unknown() });

export async function saveMenu<C extends SiteRenderContext>(
  ctx: TenantContext,
  handleInput: unknown,
  input: unknown,
  composition: SiteComposition<C>,
): Promise<MenuView> {
  const handle = NAVIGATION_HANDLES.find((h) => h === handleInput);
  if (!handle) throw notFound();
  const data = parseInput(saveSchema, input);
  const parsed = navigationItemsSchema(composition.registry.linkSchema).safeParse(data.items);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new DomainError("VALIDATION_FAILED", "Please correct the menu.", {
      items: first ? `${first.path.join(".")}: ${first.message}` : "Invalid menu.",
    });
  }
  const items = parsed.data;
  return inSite(
    ctx,
    "navigation.manage",
    async (tx, store) => {
      const problems = await missingReferences(tx, composition, menuReferences(items, composition));
      if (problems.length > 0)
        throw invalid(`This menu can't be saved: ${problems.join(" ")}`, {
          items: problems.join(" "),
        });
      const json = JSON.stringify(items);
      let rows: { revision: number }[];
      if (data.revision === 0) {
        try {
          rows = await tx.$queryRaw<{ revision: number }[]>`
            INSERT INTO "Navigation" (id, "organisationId", "storeId", handle, title, items, revision, "updatedById", "updatedAt")
            VALUES (gen_random_uuid(), ${store.organisationId}::uuid, ${store.storeId}::uuid, ${handle},
                    ${TITLES[handle]}, ${json}::jsonb, 1, ${store.userId}::uuid, now())
            RETURNING revision`;
        } catch (error) {
          if (pgCode(error) === "23505") throw conflict(MENU_CONFLICT);
          throw error;
        }
      } else {
        rows = await tx.$queryRaw<{ revision: number }[]>`
          UPDATE "Navigation" SET items = ${json}::jsonb, revision = revision + 1,
                 "updatedById" = ${store.userId}::uuid, "updatedAt" = now()
          WHERE handle = ${handle} AND revision = ${data.revision}
          RETURNING revision`;
      }
      const row = rows[0];
      if (!row) throw conflict(MENU_CONFLICT);
      await recordAudit(
        tx,
        store,
        "navigation.saved",
        { type: "Store", id: store.storeId },
        {
          menu: handle,
          items: items.length,
        },
      );
      return { handle, items, revision: row.revision, saved: true };
    },
    { write: true },
  );
}
