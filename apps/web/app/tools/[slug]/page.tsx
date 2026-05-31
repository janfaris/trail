import { EntityDetailView } from "@/components/entity-detail";
import { SiteNav } from "@/components/site-nav";
import { type EntityDetail, loadEntityDetail } from "@/lib/entity-queries";
import { displayLabel } from "@/lib/entity-tags";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const detail = await loadEntityDetail("tool", slug);
    if (!detail) return { robots: { index: false, follow: true } };
    const label = displayLabel(detail.slug, detail.label);
    const rate = Math.round(detail.summary.shippedRate * 100);
    const desc = `${detail.summary.total} sessions · ${rate}% shipped · ${detail.builders} builders using ${label}. Ranked by real usage on Trail.`;
    return {
      title: `${label} — sessions, usage & outcomes | Trail`,
      description: desc,
      openGraph: { title: `${label} on Trail`, description: desc, type: "website" },
    };
  } catch {
    return { robots: { index: false, follow: true } };
  }
}

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let detail: EntityDetail | null = null;
  try {
    detail = await loadEntityDetail("tool", slug);
  } catch {
    // Treat load failures as not-found to avoid surfacing thin pages.
  }
  if (!detail) notFound();
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav currentPath="/tools" />
      <main className="w-full">
        <EntityDetailView kind="tool" detail={detail} />
      </main>
    </div>
  );
}
