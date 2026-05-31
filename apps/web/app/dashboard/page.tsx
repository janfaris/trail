import { DashboardClient, type SessionRow } from "@/components/dashboard-client";
import { SiteNav } from "@/components/site-nav";
import { FREE_PUBLIC_RECEIPT_LIMIT } from "@/lib/paywall";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────
// /dashboard — owner-only Builder Studio.
//
// Why: raw session rows are not the social product. This page helps builders
// decide which receipts are ready to become public proof on their profile/feed.
// ─────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Builder Studio · Trail",
  description: "Review, publish, and share your AI coding receipts.",
};

export default async function DashboardPage() {
  const [{ auth }, { db, schema }] = await Promise.all([
    import("@/lib/auth"),
    import("@/db/client"),
  ]);
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user) redirect("/");
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, s.user.id) });
  if (!me) redirect("/");

  const [rows, publicCountRows] = await Promise.all([
    db
      .select({
        id: schema.trailSession.id,
        slug: schema.trailSession.slug,
        title: schema.trailSession.title,
        summary: schema.trailSession.summary,
        tool: schema.trailSession.tool,
        eventCount: schema.trailSession.eventCount,
        startedAt: schema.trailSession.startedAt,
        endedAt: schema.trailSession.endedAt,
        sharedAt: schema.trailSession.sharedAt,
        visibility: schema.trailSession.visibility,
        outcome: schema.trailSession.outcome,
        linkedRepo: schema.trailSession.linkedRepo,
        linkedCommitSha: schema.trailSession.linkedCommitSha,
        receiptStatus: schema.trailSession.receiptStatus,
        receiptVerifiedSha: schema.trailSession.receiptVerifiedSha,
        receiptGeneratedAt: schema.trailSession.receiptGeneratedAt,
        receiptTldr: schema.trailSession.receiptTldr,
        receiptOutcome: schema.trailSession.receiptOutcome,
        pendingReviewReasons: schema.trailSession.pendingReviewReasons,
        redactedAt: schema.trailSession.redactedAt,
        isFeatured: schema.trailSession.isFeatured,
        reactionCount: sql<number>`(
          select count(*)::int
          from session_reaction sr
          where sr.session_id = ${schema.trailSession.id}
        )`,
        commentCount: sql<number>`(
          select count(*)::int
          from session_comment sc
          where sc.session_id = ${schema.trailSession.id}
            and sc.deleted_at is null
        )`,
      })
      .from(schema.trailSession)
      .where(eq(schema.trailSession.userId, me.id))
      .orderBy(desc(schema.trailSession.startedAt))
      .limit(500),
    db
      .select({ value: count() })
      .from(schema.trailSession)
      .where(
        and(
          eq(schema.trailSession.userId, me.id),
          eq(schema.trailSession.visibility, "public"),
          isNotNull(schema.trailSession.sharedAt),
          isNotNull(schema.trailSession.receiptGeneratedAt),
        ),
      ),
  ]);

  const sessions: SessionRow[] = rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    sharedAt: r.sharedAt?.toISOString() ?? null,
    receiptGeneratedAt: r.receiptGeneratedAt?.toISOString() ?? null,
    redactedAt: r.redactedAt?.toISOString() ?? null,
    pendingReviewReasons: r.pendingReviewReasons ?? null,
    reactionCount: Number(r.reactionCount ?? 0),
    commentCount: Number(r.commentCount ?? 0),
  }));
  const livePublicCount = Number(publicCountRows[0]?.value ?? 0);
  const plan = me.plan === "pro" ? "pro" : "free";

  const totals = {
    all: sessions.length,
    public: sessions.filter((r) => r.visibility === "public" && r.sharedAt != null).length,
    private: sessions.filter((r) => r.visibility === "private").length,
    shipped: sessions.filter((r) => r.receiptStatus === "shipped" || r.outcome === "shipped")
      .length,
    review: sessions.filter((r) => (r.pendingReviewReasons?.length ?? 0) > 0).length,
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_14%_0%,rgba(167,243,0,0.11),transparent_26rem),linear-gradient(180deg,#050505,#09090b_38%,#050505)] text-zinc-100">
      <SiteNav currentPath="/dashboard" />

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-10">
        <div className="mb-8 overflow-hidden rounded-[2rem] border border-zinc-800 bg-black/45 shadow-2xl shadow-black/50">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
                Trail · Builder Studio
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[0.96] tracking-[-0.07em] text-zinc-50 sm:text-6xl">
                Decide what ships to the network.
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-6 text-zinc-400 sm:text-[15px]">
                Review raw agent sessions, publish the receipts with proof, and keep your public
                profile from feeling like a file dump.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/feed"
                  className="inline-flex min-h-10 items-center rounded-full bg-[#a7f300] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-[#c8ff5e]"
                >
                  Open feed
                </Link>
                <Link
                  href={me.handle ? `/u/${me.handle}` : "/dashboard"}
                  className="inline-flex min-h-10 items-center rounded-full border border-zinc-800 bg-zinc-950 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                >
                  Preview profile
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Sessions" value={totals.all} />
              <Stat label="Live receipts" value={totals.public} tone="lime" />
              <Stat
                label="Needs review"
                value={totals.review}
                tone={totals.review > 0 ? "amber" : undefined}
              />
              <Stat label="Shipped proof" value={totals.shipped} tone="lime" />
            </div>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-zinc-800 bg-zinc-950/75 p-10 text-center">
            <div className="mb-2 font-mono text-sm text-zinc-400">No sessions yet.</div>
            <div className="text-xs text-zinc-600">
              Record one with{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300">trail record</code>,
              then refresh.
            </div>
          </div>
        ) : (
          <DashboardClient
            rows={sessions}
            handle={me.handle ?? ""}
            plan={plan}
            livePublicCount={livePublicCount}
            publicReceiptLimit={FREE_PUBLIC_RECEIPT_LIMIT}
          />
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
  tone?: "lime" | "amber";
}) {
  return (
    <div className="rounded-[1.35rem] border border-zinc-800 bg-zinc-950/75 px-4 py-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div
        className={`mt-1 text-3xl font-semibold tabular-nums ${
          tone === "lime" ? "text-[#a7f300]" : tone === "amber" ? "text-amber-300" : "text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
