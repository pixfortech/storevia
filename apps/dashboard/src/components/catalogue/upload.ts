"use client";

import type { MediaView } from "@storevia/media";
import { completeUploadAction, createUploadAction } from "@/app/(app)/s/[storeId]/media/actions";

// Browser side of an upload: ask the server for a target, send the bytes
// straight to storage (the bucket, or the local upload route), then have the
// server complete it. The server decides the type from the bytes; the
// browser's file type is only a hint.

export const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
export const MAX_BYTES = 20 * 1024 * 1024;

export type UploadOutcome = { ok: true; media: MediaView } | { ok: false; message: string };

function send(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress?: (fraction: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new Error(
            xhr.status === 413 ? "Images can be up to 20 MB." : "The upload didn't go through.",
          ),
        );
    };
    xhr.onerror = () => {
      reject(new Error("The upload didn't go through. Check your connection."));
    };
    xhr.send(form);
  });
}

export async function uploadImage(
  storeId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadOutcome> {
  if (file.size > MAX_BYTES)
    return { ok: false, message: `${file.name}: images can be up to 20 MB.` };
  const target = await createUploadAction(storeId, {
    filename: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  });
  if (!target.ok)
    return {
      ok: false,
      message: `${file.name}: ${target.message ?? "couldn't start the upload."}`,
    };
  try {
    await send(target.data.url, target.data.fields, file, onProgress);
  } catch (error) {
    return { ok: false, message: `${file.name}: ${(error as Error).message}` };
  }
  const done = await completeUploadAction(storeId, target.data.mediaId);
  if (!done.ok)
    return { ok: false, message: `${file.name}: ${done.message ?? "couldn't be processed."}` };
  return { ok: true, media: done.data };
}
