import { exportProducts } from "@storevia/commerce";
import { requireStoreAccess } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { requirePrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

// CSV export of the store's products (ADR-0027). The store comes from the
// route but access is decided by the session's membership; the file is
// built by the commerce exporter (formula-safe cells).

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const { storeId } = await params;
  try {
    const ctx = await requireStoreAccess(
      await requirePrincipal(`/s/${storeId}/products`),
      storeId,
      await requestInfo(),
    );
    const file = await exportProducts(ctx);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
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
