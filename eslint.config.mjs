// Root ESLint flat config for the whole monorepo.
// Package-boundary rules (docs/architecture/02-monorepo.md §4) are added in
// Milestone 1 together with the first packages.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/.next/",
    "**/.turbo/",
    "**/dist/",
    "**/coverage/",
    "**/playwright-report/",
    "**/test-results/",
    "**/src/generated/",
    "**/next-env.d.ts",
  ]),
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Security baseline for all code (docs/security/threat-model.md §4.4).
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      "no-eval": "error",
      "no-new-func": "error",
      "no-restricted-properties": [
        "error",
        {
          property: "$queryRawUnsafe",
          message: "Use the $queryRaw tagged template so parameters are bound.",
        },
        {
          property: "$executeRawUnsafe",
          message: "Use the $executeRaw tagged template so parameters are bound.",
        },
      ],
    },
  },
);
