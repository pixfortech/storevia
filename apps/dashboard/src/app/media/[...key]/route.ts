import {
  contentTypeForKey,
  isServableKey,
  LocalObjectStorage,
  mediaStorage,
  MEDIA_LIMITS,
} from "@storevia/media";
import { MEDIA_RESPONSE_CSP, PUBLIC_MEDIA_RESOURCE_POLICY } from "@/lib/media-origins";

// Serves processed media from local storage (development and tests; in
// production a CDN serves the bucket). Only cleaned originals and renditions
// are servable, never raw uploads; the type comes from the server-chosen
// object name, and responses can't run anything (nosniff, sandbox CSP).
// Served media is embeddable from any site (storefronts are on other sites
// than the media origin); nothing else here is, and no CORS is granted.

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const storage = mediaStorage();
  const { key: segments } = await params;
  const key = segments.join("/");
  const contentType = contentTypeForKey(key);
  if (!(storage instanceof LocalObjectStorage) || !isServableKey(key) || !contentType) {
    return new Response("Not found", { status: 404 });
  }
  const body = await storage.readForServing(key, MEDIA_LIMITS.maxBytes);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": MEDIA_RESPONSE_CSP,
      "Cross-Origin-Resource-Policy": PUBLIC_MEDIA_RESOURCE_POLICY,
    },
  });
}
