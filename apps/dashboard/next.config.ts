import type { NextConfig } from "next";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Local development reads the repository root .env; deployed environments
// inject variables directly.
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Parallel local previews (design QA) can build into separate directories.
  ...(process.env["NEXT_DIST_DIR"] ? { distDir: process.env["NEXT_DIST_DIR"] } : {}),
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@storevia/auth",
    "@storevia/billing",
    "@storevia/database",
    "@storevia/email",
    "@storevia/entitlements",
    "@storevia/observability",
    "@storevia/security",
    "@storevia/tenancy",
    "@storevia/types",
    "@storevia/ui",
    "@storevia/validation",
  ],
  serverExternalPackages: [
    "@node-rs/argon2",
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "nodemailer",
  ],
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  experimental: {
    serverActions: { bodySizeLimit: "256kb" },
  },
};

export default config;
