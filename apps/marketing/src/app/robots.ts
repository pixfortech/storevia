import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env["MARKETING_URL"] ?? "http://localhost:3000";
  // Only production is indexable; previews and staging are not.
  const indexable = process.env["STOREVIA_ENV"] === "production";
  return {
    rules: indexable ? { userAgent: "*", allow: "/" } : { userAgent: "*", disallow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
