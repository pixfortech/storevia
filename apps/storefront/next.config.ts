import type { NextConfig } from "next";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Local development reads the repository root .env; deployed environments
// inject variables directly.
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  ...(process.env["NEXT_DIST_DIR"] ? { distDir: process.env["NEXT_DIST_DIR"] } : {}),
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Hosts are resolved by the proxy; never guess a canonical URL shape.
  skipTrailingSlashRedirect: true,
  transpilePackages: [
    "@storevia/commerce",
    "@storevia/database",
    "@storevia/domains",
    "@storevia/editor",
    "@storevia/media",
    "@storevia/observability",
    "@storevia/security",
    "@storevia/types",
    "@storevia/validation",
  ],
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "sharp"],
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  experimental: {
    // Cart forms carry a variant id and a quantity.
    serverActions: { bodySizeLimit: "8kb" },
  },
};

export default config;
