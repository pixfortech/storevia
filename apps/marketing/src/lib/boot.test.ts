import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The marketing site's boot check (instrumentation register()): production
// refuses to start while Storevia's own legal documents are placeholders;
// staging and test (E2E, CI) start as before.

vi.mock("server-only", () => ({}));
vi.mock("@storevia/email", () => ({ getEmailSender: () => ({}) }));

const LIVE = {
  MARKETING_URL: "https://storevia.example",
  DASHBOARD_URL: "https://app.storevia.example",
  DATABASE_MARKETING_URL: "postgresql://marketing@db.example/storevia?sslmode=require",
  CONTACT_INBOX: "hello@storevia.example",
  TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
};

async function verify(stage: string): Promise<void> {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...LIVE, STOREVIA_ENV: stage })) {
    vi.stubEnv(key, value);
  }
  const { verifyConfiguration } = await import("./boot");
  verifyConfiguration();
}

describe("marketing boot check", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses production while the terms or privacy policy is a placeholder, naming them", async () => {
    const { LEGAL_DOCUMENTS } = await import("@/content/legal");
    const placeholders = LEGAL_DOCUMENTS.filter((d) => d.status === "placeholder");
    if (placeholders.length === 0) {
      await expect(verify("production")).resolves.toBeUndefined();
      return;
    }
    const error = await verify("production").then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("ConfigurationError");
    const message = (error as Error).message;
    expect(message).toMatch(/^Invalid marketing configuration: legal: /);
    for (const document of placeholders) {
      expect(message).toContain(`${document.title} (${document.path}) is still a placeholder`);
    }
  });

  it("starts in staging, preview and test with placeholders (they are marked on the page)", async () => {
    for (const stage of ["staging", "preview", "test", "development"]) {
      await expect(verify(stage), stage).resolves.toBeUndefined();
    }
  });
});
