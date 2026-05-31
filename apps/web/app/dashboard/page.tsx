import { DashboardClient, type SessionRow } from "@/components/dashboard-client";
import { SiteNav } from "@/components/site-nav";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────
// /dashboard — owner-only session manager.
//
// Why: previously the only way to mark a trail public/shipped was running
// `trail share <id>` per session, which is the wrong gradient — most users
// will accept the default and never share anything. The dashboard surfaces
// every session you've uploaded with one-click bulk visibility + outcome
// changes, so the recruiter view doesn't live or die on per-session ritual.
// ─────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user) redirect("/");
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, s.user.id) });
  if (!me) redirect("/");

  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      tool: schema.trailSession.tool,
      eventCount: schema.trailSession.eventCount,
      startedAt: schema.trailSession.startedAt,
      sharedAt: schema.trailSession.sharedAt,
      visibility: schema.trailSession.visibility,
      outcome: schema.trailSession.outcome,
      linkedRepo: schema.trailSession.linkedRepo,
      linkedCommitSha: schema.trailSession.linkedCommitSha,
      receiptStatus: schema.trailSession.receiptStatus,
      receiptVerifiedSha: schema.trailSession.receiptVerifiedSha,
    })
    .from(schema.trailSession)
    .where(eq(schema.trailSession.userId, me.id))
    .orderBy(desc(schema.trailSession.startedAt))
    .limit(500);

  const sessions: SessionRow[] = rows.map(({ sharedAt: _sharedAt, ...r }) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
  }));

  const totals = {
    all: sessions.length,
    public: rows.filter((r) => r.visibility === "public" && r.sharedAt != null).length,
    private: sessions.filter((r) => r.visibility === "private").length,
    shipped: sessions.filter((r) => r.outcome === "shipped").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteNav currentPath="/dashboard" />

      <main className="max-w-5xl mx-auto px-6 pt-10 pb-24">
        <div className="mb-8">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">
            Trail · session manager
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 mb-2">Your sessions</h1>
          <p className="text-sm text-zinc-500 max-w-xl">
            Everything you've recorded with the Trail CLI. Select any number and change visibility
            or outcome in one click — no more sharing one ID at a time.
          </p>

          <div className="grid grid-cols-4 gap-3 mt-6 max-w-2xl">
            <Stat label="Total" value={totals.all} />
            <Stat label="Public" value={totals.public} tone="lime" />
            <Stat label="Private" value={totals.private} />
            <Stat label="Shipped" value={totals.shipped} tone="lime" />
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg p-10 text-center">
            <div className="font-mono text-sm text-zinc-400 mb-2">No sessions yet.</div>
            <div className="text-xs text-zinc-600">
              Record one with{" "}
              <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-zinc-300">trail record</code>,
              then refresh.
            </div>
          </div>
        ) : (
          <DashboardClient rows={sessions} handle={me.handle ?? ""} />
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "lime";
}) {
  return (
    <div className="border border-zinc-900 rounded-md px-3 py-2.5">
      <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div
        className={`text-xl font-semibold tabular-nums mt-0.5 ${
          tone === "lime" ? "text-[#a7f300]" : "text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
