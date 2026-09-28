"use server";

import {
  installTheme,
  previewTheme,
  publishTheme,
  saveThemeDraft,
  type StoreThemeView,
} from "@storevia/site-admin";
import { revalidatePath } from "next/cache";
import { runDataAction, type DataActionResult } from "@/lib/action";
import { themesPath, websitePath } from "@/lib/site";
import { storeActionContext } from "@/lib/store-action";

// Theme actions (08-themes.md §10.4). Every call re-derives the store
// context from the session (the storeId argument is only a request), and the
// services check permissions (design.edit, theme.publish), validate and
// scope everything themselves: the UI hiding a button is never the only guard.

/** The Themes area and the Website overview (its theme card) show theme state. */
function revalidateThemes(storeId: string): void {
  revalidatePath(themesPath(storeId), "layout");
  revalidatePath(websitePath(storeId));
}

export async function saveThemeDraftAction(
  storeId: string,
  input: { themeKey?: string; revision: number; settings: unknown },
): Promise<DataActionResult<StoreThemeView>> {
  return runDataAction(async () => saveThemeDraft(await storeActionContext(storeId), input));
}

/** Publishes a theme's draft; for a theme that isn't live, the store switches to it. */
export async function publishThemeAction(
  storeId: string,
  input: { themeKey?: string; revision: number },
): Promise<DataActionResult<StoreThemeView>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const view = await publishTheme(ctx, input);
    revalidateThemes(ctx.storeId);
    return view;
  }, "Theme published. Your site uses it now.");
}

export async function installThemeAction(
  storeId: string,
  input: { themeKey: string },
): Promise<DataActionResult<StoreThemeView>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const view = await installTheme(ctx, input);
    revalidateThemes(ctx.storeId);
    return view;
  });
}

/** Makes an installed theme the one the store preview shows (visitors never see it). */
export async function previewThemeAction(
  storeId: string,
  input: { themeKey: string },
): Promise<DataActionResult<StoreThemeView>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const view = await previewTheme(ctx, input);
    revalidateThemes(ctx.storeId);
    return view;
  });
}
