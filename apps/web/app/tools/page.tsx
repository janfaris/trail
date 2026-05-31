import { EntityIndex } from "@/components/entity-index";
import { SiteNav } from "@/components/site-nav";
import { loadEntityIndex } from "@/lib/entity-queries";
import type { EntityStat } from "@/lib/entity-tags";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI coding tools ranked by real usage — Trail",
  description:
    "AI coding tools ranked by real session usage and shipped outcomes, grounded in proof from public Trail sessions.",
};

export default async function ToolsIndexPage() {
  let stats: EntityStat[] = [];
  try {
    stats = await loadEntityIndex("tool");
  } catch {
    // Schema may not exist yet on first deploy; render the empty state.
  }
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav currentPath="/tools" />
      <main className="w-full">
        <EntityIndex kind="tool" stats={stats} />
      </main>
    </div>
  );
}
