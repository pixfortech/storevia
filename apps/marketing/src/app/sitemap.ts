import type { MetadataRoute } from "next";

// Indexable public pages. The legal placeholders are noindex until the real
// documents are published, so they stay out.
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
  return PATHS.map((path) => ({ url: new URL(path, base).toString() }));
}
