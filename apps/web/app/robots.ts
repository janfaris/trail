import type { MetadataRoute } from "next";

const BASE = "https://gettrail.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          // OG/link-preview images live under /api/receipt/<id>/image.png and
          // must stay crawlable so social unfurls and image search work.
          "/api/receipt/",
          "/api/og/",
        ],
        disallow: [
          "/admin",
          "/api/",
          "/settings",
          "/dashboard",
          "/notifications",
          "/saved",
          "/cli-auth",
          "/welcome",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
