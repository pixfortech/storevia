import "server-only";
import { clientIp, userAgent } from "@storevia/security";
import type { RequestInfo } from "@storevia/tenancy";
import { headers } from "next/headers";

export async function requestInfo(): Promise<RequestInfo> {
  const h = await headers();
  return {
    requestId: h.get("x-request-id") ?? undefined,
    ipAddress: clientIp(h) ?? undefined,
    userAgent: userAgent(h),
  };
}

export async function requestId(): Promise<string | undefined> {
  return (await headers()).get("x-request-id") ?? undefined;
}
