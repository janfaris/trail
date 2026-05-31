import { EntityIndex } from "@/components/entity-index";
import { SiteNav } from "@/components/site-nav";
import { loadEntityIndex } from "@/lib/entity-queries";
import type { EntityStat } from "@/lib/entity-tags";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Frameworks ranked by real usage — Trail",
  description:
    "Frameworks ranked by real session usage and shipped outcomes, grounded in proof from public Trail sessions.",
};

export default async function FrameworksIndexPage() {
  let stats: EntityStat[] = [];
  try {
    stats = await loadEntityIndex("framework");
  } catch {
    // Schema may not exist yet on first deploy; render the empty state.
  }
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav currentPath="/frameworks" />
      <main className="w-full">
        <EntityIndex kind="framework" stats={stats} />
      </main>
    </div>
  );
}
