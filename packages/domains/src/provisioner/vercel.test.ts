import { describe, expect, it } from "vitest";
import { ProvisionerError } from "./types";
import { VercelProvisioner } from "./vercel";

// The Vercel adapter against mocked HTTP only (CI never calls Vercel).

const TOKEN = "vercel-token-that-must-never-leak";

type Handler = (req: { method: string; url: string; body: unknown }) => {
  status: number;
  body?: unknown;
  raw?: string;
};

function provisioner(handler: Handler, extra: { txt?: string[][] } = {}) {
  const calls: { method: string; url: string; auth: string | null }[] = [];
  const fetchMock = ((input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({ method, url, auth: headers.get("authorization") });
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const result = handler({ method, url, body });
    const text = result.raw ?? (result.body === undefined ? null : JSON.stringify(result.body));
    return Promise.resolve(new Response(text, { status: result.status }));
  }) as typeof fetch;
  const p = new VercelProvisioner({
    token: TOKEN,
    projectId: "prj_1",
    teamId: "team_1",
    baseUrl: "https://vercel.test",
    fetch: fetchMock,
    resolveTxt: (name) =>
      extra.txt ? Promise.resolve(extra.txt) : Promise.reject(new Error(`ENOTFOUND ${name}`)),
  });
  return { p, calls };
}

const CONFIG_OK = {
  misconfigured: false,
  recommendedIPv4: [{ rank: 1, value: ["76.76.21.99"] }],
  recommendedCNAME: [{ rank: 1, value: "abc123.vercel-dns-017.com." }],
};

describe("VercelProvisioner", () => {
  it("adds a domain with the token in the header only, and reads its DNS instructions", async () => {
    const { p, calls } = provisioner(({ method, url }) => {
      if (method === "POST" && url.includes("/v10/projects/prj_1/domains")) {
        return { status: 200, body: { name: "www.abc.com", verified: true } };
      }
      if (url.includes("/v6/domains/www.abc.com/config")) return { status: 200, body: CONFIG_OK };
      return { status: 500 };
    });
    const status = await p.addDomain("www.abc.com");
    expect(status).toEqual({
      registered: true,
      ref: "vercel:prj_1:www.abc.com",
      verified: true,
      configured: true,
      certificate: "ready",
      records: [
        {
          type: "CNAME",
          name: "www.abc.com",
          value: "abc123.vercel-dns-017.com",
          purpose: "routing",
        },
      ],
    });
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(calls.every((c) => c.url.includes("teamId=team_1") && !c.url.includes(TOKEN))).toBe(
      true,
    );
  });

  it("an apex domain gets the recommended A record; defaults when the API recommends none", async () => {
    const { p } = provisioner(({ url }) =>
      url.includes("/config")
        ? { status: 200, body: { misconfigured: true } }
        : { status: 200, body: { name: "abc.com", verified: true } },
    );
    const status = await p.getDomainStatus("abc.com");
    expect(status.configured).toBe(false);
    expect(status.certificate).toBe("pending");
    expect(status.records).toEqual([
      { type: "A", name: "abc.com", value: "76.76.21.21", purpose: "routing" },
    ]);
  });

  it("adding twice is idempotent: a 409 for a domain already on our project is success", async () => {
    const { p } = provisioner(({ method, url }) => {
      if (method === "POST")
        return { status: 409, body: { error: { code: "domain_already_in_use" } } };
      if (url.includes("/config")) return { status: 200, body: CONFIG_OK };
      return { status: 200, body: { name: "shop.abc.com", verified: true } };
    });
    await expect(p.addDomain("shop.abc.com")).resolves.toMatchObject({ registered: true });
  });

  it("a domain owned by another Vercel account is a conflict", async () => {
    const { p } = provisioner(({ method }) =>
      method === "POST"
        ? { status: 409, body: { error: { code: "domain_taken" } } }
        : { status: 404 },
    );
    await expect(p.addDomain("abc.com")).rejects.toMatchObject({ kind: "conflict" });
  });

  it("pending provider verification exposes its TXT challenge, not the payload", async () => {
    const { p } = provisioner(({ url }) =>
      url.includes("/config")
        ? { status: 200, body: { misconfigured: true } }
        : {
            status: 200,
            body: {
              name: "abc.com",
              verified: false,
              verification: [
                {
                  type: "TXT",
                  domain: "_vercel.abc.com",
                  value: "vc-domain-verify=abc.com,1a2b",
                  reason: "pending",
                },
                { type: "UNKNOWN", junk: true },
              ],
              internalField: "never shown",
            },
          },
    );
    const status = await p.getDomainStatus("abc.com");
    expect(status.verified).toBe(false);
    expect(status.records).toContainEqual({
      type: "TXT",
      name: "_vercel.abc.com",
      value: "vc-domain-verify=abc.com,1a2b",
      purpose: "provider-verification",
    });
    expect(JSON.stringify(status)).not.toContain("never shown");
  });

  it("verifying a domain that isn't verifiable yet reports its current state", async () => {
    const { p } = provisioner(({ method, url }) => {
      if (method === "POST" && url.endsWith("/verify?teamId=team_1")) {
        return { status: 400, body: { error: { code: "missing_txt_record" } } };
      }
      if (url.includes("/config")) return { status: 200, body: { misconfigured: true } };
      return { status: 200, body: { name: "abc.com", verified: false } };
    });
    await expect(p.verifyDomain("abc.com")).resolves.toMatchObject({ verified: false });
  });

  it("an unknown domain is simply not registered", async () => {
    const { p } = provisioner(() => ({ status: 404, body: { error: { code: "not_found" } } }));
    await expect(p.getDomainStatus("abc.com")).resolves.toMatchObject({
      registered: false,
      ref: null,
    });
  });

  it("removing is idempotent (200 and 404 both succeed)", async () => {
    for (const status of [200, 204, 404]) {
      const { p, calls } = provisioner(() => ({ status }));
      await expect(p.removeDomain("abc.com")).resolves.toBeUndefined();
      expect(calls[0]).toMatchObject({ method: "DELETE" });
    }
  });

  it("5xx and 429 are 'unavailable'; malformed bodies are 'invalid'", async () => {
    for (const status of [500, 502, 503, 429]) {
      const { p } = provisioner(() => ({ status }));
      await expect(p.getDomainStatus("abc.com")).rejects.toMatchObject({ kind: "unavailable" });
    }
    const { p: garbled } = provisioner(() => ({ status: 200, raw: "<html>oops" }));
    await expect(garbled.getDomainStatus("abc.com")).rejects.toMatchObject({ kind: "invalid" });
    const { p: wrong } = provisioner(() => ({ status: 200, body: { name: "evil.com" } }));
    await expect(wrong.getDomainStatus("abc.com")).rejects.toMatchObject({ kind: "invalid" });
    const { p: odd } = provisioner(() => ({ status: 418 }));
    await expect(odd.removeDomain("abc.com")).rejects.toMatchObject({ kind: "invalid" });
  });

  it("timeouts and network failures are typed and never include the token", async () => {
    const slow = new VercelProvisioner({
      token: TOKEN,
      projectId: "prj_1",
      baseUrl: "https://vercel.test",
      timeoutMs: 20,
      fetch: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        })) as typeof fetch,
    });
    const timeout = await slow.addDomain("abc.com").catch((e: unknown) => e);
    expect(timeout).toBeInstanceOf(ProvisionerError);
    expect(timeout).toMatchObject({ kind: "timeout" });
    const down = new VercelProvisioner({
      token: TOKEN,
      projectId: "prj_1",
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });
    const error = await down.getDomainStatus("abc.com").catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "unavailable" });
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it("reads TXT records by joining chunks; lookup failures are 'none yet'", async () => {
    const { p } = provisioner(() => ({ status: 200 }), {
      txt: [["storevia-verification=", "abc"], ["other"]],
    });
    await expect(p.lookupTxt("_storevia-verification.abc.com")).resolves.toEqual([
      "storevia-verification=abc",
      "other",
    ]);
    const { p: none } = provisioner(() => ({ status: 200 }));
    await expect(none.lookupTxt("_storevia-verification.abc.com")).resolves.toEqual([]);
  });

  it("refuses to start without credentials", () => {
    expect(() => new VercelProvisioner({ token: "", projectId: "prj" })).toThrow(
      /VERCEL_API_TOKEN/,
    );
  });
});
