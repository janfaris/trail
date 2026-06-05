import { loadEntitySlugs, loadPublicPostSlugs, loadPublicProfileSlugs } from "@/lib/entity-queries";
import { type EntityKind, entityHref } from "@/lib/entity-tags";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

const BASE = "https://gettrail.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/feed`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/discover`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/puerto-rico`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/tools`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/frameworks`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/learn`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // Each loader is independently fault-tolerant: a failure in one (or a missing
  // DB at edge eval) degrades to fewer URLs rather than a broken sitemap.
  const [entities, profiles, posts] = await Promise.all([
    loadEntitySlugs().catch(() => [] as { kind: EntityKind; tag: string }[]),
    loadPublicProfileSlugs().catch(() => [] as { handle: string; lastSharedAt: Date }[]),
    loadPublicPostSlugs().catch(() => [] as { handle: string; slug: string; lastModified: Date }[]),
  ]);

  const entityRoutes: MetadataRoute.Sitemap = entities.map(({ kind, tag }) => ({
    url: `${BASE}${entityHref(kind, tag)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const profileRoutes: MetadataRoute.Sitemap = profiles.map(({ handle, lastSharedAt }) => ({
    url: `${BASE}/u/${encodeURIComponent(handle)}`,
    lastModified: lastSharedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const postRoutes: MetadataRoute.Sitemap = posts.map(({ handle, slug, lastModified }) => ({
    url: `${BASE}/u/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...profileRoutes, ...postRoutes, ...entityRoutes];
}
