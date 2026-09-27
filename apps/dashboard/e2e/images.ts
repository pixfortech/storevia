import type { Page } from "@playwright/test";

// Real images for upload tests, drawn by the browser (the dashboard has no
// image library of its own).

/** One image per format (JPEG, PNG, WebP), `width` × 3/4 `width` pixels. */
export async function images(page: Page, width = 800) {
  const encoded = await page.evaluate(async (w) => {
    const draw = async (type: string, colour: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = Math.round((w * 3) / 4);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.fillRect(w / 8, w / 8, w / 2.5, w / 4);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, type, 0.9);
      });
      if (blob?.type !== type) throw new Error(`can't encode ${type}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary);
    };
    return {
      jpeg: await draw("image/jpeg", "#b45309"),
      png: await draw("image/png", "#1d4ed8"),
      webp: await draw("image/webp", "#15803d"),
    };
  }, width);
  return [
    { name: "mug.jpg", mimeType: "image/jpeg", buffer: Buffer.from(encoded.jpeg, "base64") },
    { name: "bowl.png", mimeType: "image/png", buffer: Buffer.from(encoded.png, "base64") },
    { name: "vase.webp", mimeType: "image/webp", buffer: Buffer.from(encoded.webp, "base64") },
  ];
}
