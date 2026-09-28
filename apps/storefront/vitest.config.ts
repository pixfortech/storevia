import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX for Next ("preserve"); tests compile it themselves.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "server-only": resolve(import.meta.dirname, "../../tooling/empty-module.ts"),
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
