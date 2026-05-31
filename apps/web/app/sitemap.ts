import { loadEntitySlugs } from "@/lib/entity-queries";
import { type EntityKind, entityHref } from "@/lib/entity-tags";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

const BASE = "https://gettrail.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/tools`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/frameworks`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];

  let entries: { kind: EntityKind; tag: string }[] = [];
  try {
    entries = await loadEntitySlugs();
  } catch {
    return staticRoutes;
  }

  const entityRoutes: MetadataRoute.Sitemap = entries.map(({ kind, tag }) => ({
    url: `${BASE}${entityHref(kind, tag)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...entityRoutes];
}
