import { exportOrganisationData } from "@storevia/commerce/data-export";
import { requireOrganisationAccess } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { requirePrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

// The organisation's data export (M8): a POST from the settings page (a
// cross-site form can't carry the session cookie, and the origin must be
// ours), owner-only and stepped up in the service. The JSON document is
// streamed as it is read, so a large organisation never sits in memory.

export const runtime = "nodejs";

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;
  const settings = `/o/${orgId}/settings`;
  // Same rule as Next's server actions: the Origin's host must be the host
  // the request was sent to (request.url is the server's internal address).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin !== null && (!host || hostOf(origin) !== host)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const ctx = await requireOrganisationAccess(
      await requirePrincipal(settings),
      orgId,
      await requestInfo(),
    );
    const chunks = await exportOrganisationData(ctx);
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
    const date = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="storevia-export-${date}.json"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isDomainError(error)) {
      // Back to settings with the reason; the page explains it.
      const reason =
        error.code === "REAUTHENTICATION_REQUIRED"
          ? "reauth"
          : error.code === "RATE_LIMITED"
            ? "limit"
            : error.code === "FORBIDDEN"
              ? "forbidden"
              : null;
      if (!reason) return new Response("Not found", { status: 404 });
      // A relative Location: request.url is the server's internal address.
      return new Response(null, {
        status: 303,
        headers: { Location: `${settings}?export=${reason}#data` },
      });
    }
    throw error;
  }
}
