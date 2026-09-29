import { exportOrders } from "@storevia/commerce";
import { requireStoreAccess } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { requirePrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

// CSV export of the store's orders (order.read). The store comes from the
// route but access is decided by the session's membership: another tenant's
// store is a 404, a role without order.read a 403. The filters are the
// orders page's own (status tab, search) plus a date range in the store's
// timezone. Rows are read in batches as the download streams, so a large
// store never sits in memory.

export const runtime = "nodejs";

const PARAMS = ["status", "q", "from", "to"] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const { storeId } = await params;
  const search = new URL(request.url).searchParams;
  const query = Object.fromEntries(
    PARAMS.map((key) => [key, (search.get(key) ?? "").slice(0, 100)]),
  ) as Record<(typeof PARAMS)[number], string>;
  try {
    const ctx = await requireStoreAccess(
      await requirePrincipal(`/s/${storeId}/orders`),
      storeId,
      await requestInfo(),
    );
    const file = await exportOrders(ctx, query);
    const chunks = file.chunks;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
      async cancel() {
        await chunks.return(undefined);
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isDomainError(error)) {
      if (error.code === "VALIDATION_FAILED" || error.code === "RATE_LIMITED") {
        // Back to the orders page with the reason; the page explains it.
        const back = new URLSearchParams();
        for (const key of PARAMS) if (query[key]) back.set(key, query[key]);
        back.set("export", error.code === "RATE_LIMITED" ? "limit" : "dates");
        // A relative Location: request.url is the server's internal address.
        return new Response(null, {
          status: 303,
          headers: { Location: `/s/${storeId}/orders?${back.toString()}` },
        });
      }
      return new Response(error.code === "FORBIDDEN" ? "Forbidden" : "Not found", {
        status: error.code === "FORBIDDEN" ? 403 : 404,
      });
    }
    throw error;
  }
}
