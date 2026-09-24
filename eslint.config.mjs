// Root ESLint flat config for the whole monorepo.
// Package-boundary rules (docs/architecture/02-monorepo.md §4): privileged
// database entry points are allow-listed below.
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
  {
    // ADR-0022: code never branches on plan keys; it asks the entitlement
    // engine. Plan keys may appear only in seeds, tests and platform-admin.
    files: ["{apps,packages}/**/*.{ts,tsx}"],
    ignores: [
      "packages/database/scripts/**",
      "apps/dashboard/scripts/**",
      "apps/platform-admin/**",
      "**/tests/**",
      "**/e2e/**",
      "**/*.test.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^(starter|business|enterprise)$/]",
          message: "Don't reference plan keys; use hasFeature/assertFeature/consumeUsage.",
        },
      ],
    },
  },
  {
    // ADR-0024: business type is presentation only. The code that enforces
    // permissions and entitlements must never branch on it. (Repeats the
    // plan-key selector: flat config replaces, not merges, a rule's options.)
    files: [
      "packages/{auth,billing,entitlements,jobs,security}/src/**/*.ts",
      "packages/tenancy/src/{context,rbac,members,invitations,organisations,platform,billing,audit}.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^(starter|business|enterprise)$/]",
          message: "Don't reference plan keys; use hasFeature/assertFeature/consumeUsage.",
        },
        {
          selector: "Literal[value=/^(ECOMMERCE|BUSINESS|PUBLISHING|PORTFOLIO)$/]",
          message: "Business type is never an authorisation or entitlement input (ADR-0024).",
        },
      ],
    },
  },
  {
    // packages/billing: its own billing role and the platform role, never the
    // system role (shared with the dashboard's auth path).
    files: ["packages/billing/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@storevia/database/system",
              message: "Billing uses @storevia/database/billing (M2 security review).",
            },
          ],
        },
      ],
    },
  },
  {
    // Privileged database entry points are allow-listed (02-monorepo.md §4).
    files: ["{apps,packages}/**/*.{ts,tsx}"],
    ignores: [
      "packages/database/**",
      "packages/auth/**",
      "packages/billing/**",
      "packages/security/src/rate-limit.ts",
      "packages/tenancy/src/invitations.ts",
      "packages/tenancy/src/platform.ts",
      "apps/platform-admin/**",
      "**/tests/**",
      "**/e2e/**",
      "**/scripts/**",
      "packages/jobs/**",
      "apps/worker/**",
      "apps/marketing/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@storevia/database/system",
              message: "The system role is allow-listed (docs/architecture/02-monorepo.md §4).",
            },
            {
              name: "@storevia/database/platform",
              message: "The platform role is for platform-admin and packages/billing only.",
            },
            {
              name: "@storevia/database/billing",
              message: "The billing role is for packages/billing only.",
            },
            {
              name: "@storevia/database/worker",
              message: "The worker role is for packages/jobs and apps/worker only.",
            },
            {
              name: "@storevia/database/marketing",
              message: "The marketing role is for apps/marketing only (ADR-0025).",
            },
            {
              name: "@storevia/database/testing",
              message: "Test helpers must not be imported by application code.",
            },
          ],
        },
      ],
    },
  },
  {
    // The public site holds only the marketing role (ADR-0025): no other
    // database role, and no server services that would need one.
    files: ["apps/marketing/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...[
              "@storevia/database/system",
              "@storevia/database/platform",
              "@storevia/database/billing",
              "@storevia/database/worker",
              "@storevia/database/testing",
              "@storevia/security/server",
              "@storevia/auth",
              "@storevia/billing",
            ].map((name) => ({
              name,
              message: "The marketing site uses only its own role (ADR-0025).",
            })),
            ...["@storevia/database", "@storevia/tenancy", "@storevia/entitlements"].map(
              (name) => ({
                name,
                allowTypeImports: true,
                message:
                  "Server services use other roles; import client-safe subpaths or types only (ADR-0025).",
              }),
            ),
          ],
        },
      ],
    },
  },
);
