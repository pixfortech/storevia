import { requireStoreAccess, storefrontPreviewUrl } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { requirePrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

// Opens the storefront preview (ADR-0028 §11, ADR-0030 §6). The signed,
// 15-minute token is minted only when the merchant clicks, for members with
// design.edit, and is bound to this store; the storefront swaps it for a
// cookie, drops it from the URL, and shows the store's drafts. `path` picks
// one of the store's own pages; anything else opens the home page.

export const runtime = "nodejs";

/** Only the store's own page paths: "/" and "/pages/{handle}" (never another host or a protocol-relative URL). */
const PREVIEW_PATH_RE = /^\/(?:pages\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const { storeId } = await params;
  const requested = new URL(request.url).searchParams.get("path") ?? "/";
  const path = requested.length <= 110 && PREVIEW_PATH_RE.test(requested) ? requested : "/";
  try {
    const ctx = await requireStoreAccess(
      await requirePrincipal(`/s/${storeId}/settings`),
      storeId,
      await requestInfo(),
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: await storefrontPreviewUrl(ctx, path),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (isDomainError(error)) {
      return new Response(error.code === "FORBIDDEN" ? "Forbidden" : "Not found", {
        status: error.code === "FORBIDDEN" ? 403 : 404,
      });
    }
    throw error;
  }
}
