import { requireStoreAccess, storefrontPreviewUrl } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { requirePrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

// Opens the storefront preview (ADR-0028 §11). The signed, 15-minute token is
// minted only when the merchant clicks, for members with design.edit, and is
// bound to this store; the storefront swaps it for a cookie and drops it
// from the URL.

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const { storeId } = await params;
  try {
    const ctx = await requireStoreAccess(
      await requirePrincipal(`/s/${storeId}/settings`),
      storeId,
      await requestInfo(),
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: await storefrontPreviewUrl(ctx),
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
