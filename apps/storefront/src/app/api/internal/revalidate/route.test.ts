// The cache invalidation endpoint (ADR-0028 §9) acts only on requests signed
// with STOREFRONT_REVALIDATE_SECRET over "{timestamp}.{body}" within five
// minutes, and only on well-formed tags.
import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { pageDataCache } from "@/lib/cache";
import { POST } from "./route";

const SECRET = "revalidate-test-secret-0000000000000000";
const PRODUCT = "0190f2a4-0000-7000-8000-000000000001";
const OTHER = "0190f2a4-0000-7000-8000-000000000002";

beforeAll(() => {
  process.env["STOREFRONT_REVALIDATE_SECRET"] = SECRET;
});
afterEach(() => {
  pageDataCache().clear();
});

const now = () => Math.floor(Date.now() / 1000);

function request(
  body: string,
  {
    timestamp = now(),
    secret = SECRET,
    authorization,
  }: {
    timestamp?: number | string;
    secret?: string;
    authorization?: string;
  } = {},
): Request {
  const signature = createHmac("sha256", secret)
    .update(`${String(timestamp)}.${body}`)
    .digest("hex");
  return new Request("http://storefront.test/api/internal/revalidate", {
    method: "POST",
    headers: {
      "x-storevia-timestamp": String(timestamp),
      authorization: authorization ?? `Bearer ${signature}`,
    },
    body,
  });
}

async function cached(key: string, tag: string): Promise<void> {
  await pageDataCache().get(key, () => Promise.resolve({ value: key, tags: [tag] }));
}

const isCached = async (key: string) => {
  let loaded = false;
  await pageDataCache().get(key, () => {
    loaded = true;
    return Promise.resolve({ value: key, tags: [] });
  });
  return !loaded;
};

describe("POST /api/internal/revalidate", () => {
  it("drops the entries carrying a signed request's tags, and only those", async () => {
    await cached("a", `product:${PRODUCT}`);
    await cached("b", `product:${OTHER}`);
    const response = await POST(
      request(JSON.stringify({ tags: [`product:${PRODUCT}`, "not a tag", "product:../x"] })),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: 1, dropped: 1 });
    expect(await isCached("a")).toBe(false);
    expect(await isCached("b")).toBe(true);
  });

  it.each([
    ["no signature", { authorization: "" }],
    ["a malformed signature", { authorization: "Bearer xyz" }],
    ["another secret", { secret: "someone-elses-secret-000000000000000000" }],
    ["a stale timestamp", { timestamp: now() - 301 }],
    ["a future timestamp", { timestamp: now() + 301 }],
    ["a non-numeric timestamp", { timestamp: "1e3" }],
  ])("refuses %s and invalidates nothing", async (_case, options) => {
    await cached("a", `product:${PRODUCT}`);
    const response = await POST(request(JSON.stringify({ tags: [`product:${PRODUCT}`] }), options));
    expect(response.status).toBe(401);
    expect(await isCached("a")).toBe(true);
  });

  it("refuses a signed body replayed with a different body", async () => {
    await cached("a", `product:${PRODUCT}`);
    const timestamp = now();
    const signed = request(JSON.stringify({ tags: [`product:${OTHER}`] }), { timestamp });
    const forged = new Request(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: JSON.stringify({ tags: [`product:${PRODUCT}`] }),
    });
    expect((await POST(forged)).status).toBe(401);
    expect(await isCached("a")).toBe(true);
  });

  it("refuses oversized bodies", async () => {
    const response = await POST(request(" ".repeat(64 * 1024 + 1)));
    expect(response.status).toBe(413);
  });
});
