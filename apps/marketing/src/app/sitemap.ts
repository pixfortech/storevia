import type { MetadataRoute } from "next";

const PATHS = ["/", "/products", "/solutions", "/pricing", "/resources", "/about", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env["MARKETING_URL"] ?? "http://localhost:3000";
  return PATHS.map((path) => ({ url: new URL(path, base).toString() }));
}
