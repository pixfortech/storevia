import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests for the dashboard's scripts (the development seed)
// against the *_test database, like the packages' integration suites.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "server-only": resolve(import.meta.dirname, "../../tooling/empty-module.ts"),
    },
  },
  test: {
    include: ["scripts/**/*.int.test.ts"],
    globalSetup: ["../../tooling/vitest-db-env.ts"],
    setupFiles: ["../../tooling/vitest-db-env.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
