import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "server-only": resolve(import.meta.dirname, "../../tooling/empty-module.ts") },
  },
  test: { include: ["src/**/*.test.ts"] },
});
