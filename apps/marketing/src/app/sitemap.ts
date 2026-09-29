import type { MetadataRoute } from "next";
import { LEGAL_DOCUMENTS } from "@/content/legal";

// Indexable public pages. The legal placeholders are noindex until the real
// documents are published (content/legal.ts), so only final ones are listed.
const PATHS = [
  "/",
  "/products",
  "/solutions",
  "/features",
  "/pricing",
  "/resources",
  "/changelog",
  "/about",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env["MARKETING_URL"] ?? "http://localhost:3000";
  const legal = LEGAL_DOCUMENTS.filter((document) => document.status === "final").map(
    (document) => document.path,
  );
  return [...PATHS, ...legal].map((path) => ({ url: new URL(path, base).toString() }));
}
