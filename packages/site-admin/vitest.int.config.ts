import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "server-only": resolve(import.meta.dirname, "../../tooling/empty-module.ts") },
  },
  test: {
    include: ["tests/**/*.int.test.ts"],
    globalSetup: ["../../tooling/vitest-db-env.ts"],
    setupFiles: ["../../tooling/vitest-db-env.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
