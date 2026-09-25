import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for pure presentation logic (node environment). The admin's
// end-to-end coverage lives in apps/dashboard/e2e.
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: { include: ["src/**/*.test.ts"] },
});
