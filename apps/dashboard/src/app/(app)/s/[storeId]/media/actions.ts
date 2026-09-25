"use server";

import {
  completeMediaUpload,
  createMediaUpload,
  deleteMedia,
  listMedia,
  updateMediaAlt,
  type MediaView,
} from "@storevia/media";
import { revalidatePath } from "next/cache";
import { runDataAction, type DataActionResult } from "@/lib/action";
import { mediaPath } from "@/lib/catalogue";
import { storeActionContext } from "@/lib/store-action";

// Media library actions. The browser uploads bytes straight to storage with a
// short-lived target from createUploadAction; completeUploadAction then has
// the server sniff, decode, clean and store the image. The store comes from
// the session's membership every time.

export interface UploadTargetView {
  readonly mediaId: string;
  readonly url: string;
  readonly fields: Record<string, string>;
}

export async function createUploadAction(
  storeId: string,
  file: { filename: string; size: number; contentType: string },
): Promise<DataActionResult<UploadTargetView>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const { mediaId, upload } = await createMediaUpload(ctx, file);
    return { mediaId, url: upload.url, fields: { ...upload.fields } };
  });
}

export async function completeUploadAction(
  storeId: string,
  mediaId: string,
): Promise<DataActionResult<MediaView>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    const view = await completeMediaUpload(ctx, mediaId);
    revalidatePath(mediaPath(ctx.storeId));
    return view;
  });
}

export async function listMediaAction(
  storeId: string,
  options: { q?: string; before?: string },
): Promise<DataActionResult<{ items: readonly MediaView[]; nextCursor: string | null }>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    return listMedia(ctx, { q: options.q, before: options.before, limit: 48 });
  });
}

export async function updateMediaAltAction(
  storeId: string,
  mediaId: string,
  altText: string,
): Promise<DataActionResult<null>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    await updateMediaAlt(ctx, mediaId, { altText });
    revalidatePath(mediaPath(ctx.storeId));
    return null;
  }, "Alt text saved.");
}

export async function deleteMediaAction(
  storeId: string,
  mediaId: string,
): Promise<DataActionResult<null>> {
  return runDataAction(async () => {
    const ctx = await storeActionContext(storeId);
    await deleteMedia(ctx, mediaId);
    revalidatePath(mediaPath(ctx.storeId));
    return null;
  }, "Image deleted.");
}
