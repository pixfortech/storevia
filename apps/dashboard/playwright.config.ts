import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Local runs read the repository root .env (CI injects variables directly).
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);

const baseURL = process.env["E2E_BASE_URL"] ?? "http://app.localhost:3001";
const adminURL = process.env["E2E_ADMIN_URL"] ?? "http://admin.localhost:3003";
const marketingURL = process.env["E2E_MARKETING_URL"] ?? "http://localhost:3000";
// Node does not resolve *.localhost names (browsers do): probe via localhost.
const probe = (url: string) =>
  `${new URL(url).protocol}//localhost:${new URL(url).port || "80"}/api/health`;
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm start",
      url: probe(baseURL),
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      // Platform-admin (staff) app: plan assignment and mock billing (ADR-0022).
      command: "pnpm --filter @storevia/platform-admin start",
      url: probe(adminURL),
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      // Public marketing site: pricing from the plan catalogue, contact form (ADR-0025).
      command: "pnpm --filter @storevia/marketing start",
      url: probe(marketingURL),
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      stdout: "pipe",
    },
  ],
});
