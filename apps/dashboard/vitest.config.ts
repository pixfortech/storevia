import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for pure presentation logic (node environment). Playwright specs
// live in e2e/ and are not run here.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "server-only": resolve(import.meta.dirname, "../../tooling/empty-module.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
