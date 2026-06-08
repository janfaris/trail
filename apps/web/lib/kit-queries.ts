import { db, schema } from "@/db/client";
import type { KitStackManifest } from "@/lib/kit-types";
import { and, desc, eq } from "drizzle-orm";

// Shared, defensive Build Kit list loaders. Every query is wrapped so a missing
// table (pre-migration) or transient error yields [] instead of throwing — these
// power secondary surfaces (feed rail, profile, hub, library) that must never
// take down their host page.

export interface KitListItem {
  id: string;
  title: string;
  summary: string | null;
  sourceRepo: string;
  reproducibility: string;
  reuseCount: number;
  visibility: string;
  frameworks: string[];
  createdAt: Date | string;
  authorHandle: string | null;
  authorName: string | null;
  authorImage: string | null;
  authorGithub: string | null;
}

type RawKitRow = Omit<KitListItem, "frameworks"> & {
  stackManifest: KitStackManifest | null;
};

function shapeRows(rows: RawKitRow[]): KitListItem[] {
  return rows.map(({ stackManifest, ...rest }) => ({
    ...rest,
    frameworks: stackManifest?.frameworks ?? [],
  }));
}

const baseColumns = {
  id: schema.buildKit.id,
  title: schema.buildKit.title,
  summary: schema.buildKit.summary,
  sourceRepo: schema.buildKit.sourceRepo,
  reproducibility: schema.buildKit.reproducibility,
  reuseCount: schema.buildKit.reuseCount,
  visibility: schema.buildKit.visibility,
  stackManifest: schema.buildKit.stackManifest,
  createdAt: schema.buildKit.createdAt,
  authorHandle: schema.user.handle,
  authorName: schema.user.name,
  authorImage: schema.user.image,
  authorGithub: schema.user.githubHandle,
};

/** Public kits for discovery surfaces. sort: "recent" (default) or "forks". */
export async function listPublicKits(
  opts: { limit?: number; sort?: "recent" | "forks" } = {},
): Promise<KitListItem[]> {
  const limit = opts.limit ?? 12;
  const order =
    opts.sort === "forks"
      ? [desc(schema.buildKit.reuseCount), desc(schema.buildKit.createdAt)]
      : [desc(schema.buildKit.createdAt)];
  try {
    const rows = await db
      .select(baseColumns)
      .from(schema.buildKit)
      .innerJoin(schema.user, eq(schema.buildKit.userId, schema.user.id))
      .where(eq(schema.buildKit.visibility, "public"))
      .orderBy(...order)
      .limit(limit);
    return shapeRows(rows);
  } catch (err) {
    console.error("listPublicKits failed (build_kit table may be missing)", err);
    return [];
  }
}

/** Kits authored by a user. Public-only unless includePrivate is set (owner view). */
export async function listKitsByUser(
  userId: string,
  opts: { limit?: number; includePrivate?: boolean } = {},
): Promise<KitListItem[]> {
  const limit = opts.limit ?? 12;
  const where = opts.includePrivate
    ? eq(schema.buildKit.userId, userId)
    : and(eq(schema.buildKit.userId, userId), eq(schema.buildKit.visibility, "public"));
  try {
    const rows = await db
      .select(baseColumns)
      .from(schema.buildKit)
      .innerJoin(schema.user, eq(schema.buildKit.userId, schema.user.id))
      .where(where)
      .orderBy(desc(schema.buildKit.createdAt))
      .limit(limit);
    return shapeRows(rows);
  } catch (err) {
    console.error("listKitsByUser failed (build_kit table may be missing)", err);
    return [];
  }
}
