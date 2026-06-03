// /u/[user]/spend — Spend Audit Layer 1 (free, instant, owner-only).
//
// Six pure SQL aggregations rendered as a single dark-themed page. Mirrors
// the look-and-feel of /dashboard/cost: zinc-950 surface, mono labels with
// the #a7f300 accent, no client components. Window toggle is server-side
// via Next <Link> with ?window=N.
//
// Owner gate uses notFound() (not 403/redirect) so non-owners can't probe
// for the existence of someone else's spend page.
//
// Layer 2 (AI audit) is a future PR — the footer carries a disabled
// "Coming soon to Pro" affordance that's intentionally not wired up.

import { SiteNav } from "@/components/site-nav";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditFooter } from "./AuditFooter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WindowDays = 7 | 30 | 365;

const ALLOWED: readonly WindowDays[] = [7, 30, 365];

function parseWindow(raw: string | undefined): WindowDays {
  const n = Number(raw);
  if ((ALLOWED as readonly number[]).includes(n)) return n as WindowDays;
  return 30;
}

const NUM = new Intl.NumberFormat("en-US");
function fmtNum(n: number): string {
  return NUM.format(Math.round(n));
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function windowLabel(d: WindowDays): string {
  if (d === 7) return "7d";
  if (d === 30) return "30d";
  return "1y";
}

export default async function SpendPage({
  params,
  searchParams,
}: {
  params: Promise<{ user: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const [
    { headers },
    { eq },
    { db, schema },
    { auth },
    {
      getCacheHitStats,
      getCostByOutcome,
      getTokensByEventKind,
      getTokensByModel,
      getTokensByToolName,
      getTopExpensiveSessions,
    },
    { getCachedAudit },
  ] = await Promise.all([
    import("next/headers"),
    import("drizzle-orm"),
    import("@/db/client"),
    import("@/lib/auth"),
    import("@/lib/spend/queries"),
    import("@/lib/spend/audit"),
  ]);
  const { user } = await params;
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.handle, user),
  });
  if (!userRow) notFound();

  let sessionInfo: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    sessionInfo = await auth.api.getSession({ headers: await headers() });
  } catch {
    sessionInfo = null;
  }
  if (sessionInfo?.user?.id !== userRow.id) notFound();

  const sp = await searchParams;
  const windowDays = parseWindow(sp?.window);

  const [byKind, byTool, byModel, cache, byOutcome, topSessions, existingAudit] = await Promise.all(
    [
      getTokensByEventKind(userRow.id, windowDays),
      getTokensByToolName(userRow.id, windowDays),
      getTokensByModel(userRow.id, windowDays),
      getCacheHitStats(userRow.id, windowDays),
      getCostByOutcome(userRow.id, windowDays),
      getTopExpensiveSessions(userRow.id, windowDays, 10),
      getCachedAudit(userRow.id, windowDays),
    ],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.08),transparent_24rem),#050505] text-zinc-100">
      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 lg:px-10">
        <header className="mb-8 rounded-[2rem] bg-black/55 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
            Trail · spend audit
          </div>
          <h1 className="mb-2 mt-3 text-4xl font-semibold leading-none tracking-[-0.07em] text-white sm:text-5xl">
            Spend Audit
          </h1>
          <p className="max-w-xl text-sm leading-6 text-zinc-400">
            Where your tokens go. Private - only you can see this. Computed instantly from your
            captured events. No model call.
          </p>
          <div className="mt-5 flex items-center gap-2">
            {ALLOWED.map((d) => {
              const active = d === windowDays;
              return (
                <Link
                  key={d}
                  href={`/u/${user}/spend?window=${d}`}
                  className={`inline-flex min-h-10 items-center rounded-full px-4 font-mono text-xs transition-[box-shadow,color,background-color,transform] active:scale-[0.97] ${
                    active
                      ? "bg-[#a7f300]/10 text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.3)]"
                      : "bg-white/[0.04] text-zinc-300 hover:text-zinc-100"
                  }`}
                >
                  {windowLabel(d)}
                </Link>
              );
            })}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card
            title="Tokens by event kind"
            blurb="How much of your spend is prompts vs assistant completions vs tool-call dumps vs file diffs. Often a surprise."
          >
            {byKind.length === 0 ? (
              <Empty>No event data in window.</Empty>
            ) : (
              <Table head={["Kind", "Input", "Output", "Cache read", "Events"]}>
                {byKind.map((r) => (
                  <tr key={r.kind} className="border-t border-white/10">
                    <Td mono>{r.kind}</Td>
                    <Td right>{fmtNum(r.inputTokens)}</Td>
                    <Td right>{fmtNum(r.outputTokens)}</Td>
                    <Td right>{fmtNum(r.cacheReadTokens)}</Td>
                    <Td right>{fmtNum(r.eventCount)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card
            title="Tokens by tool call"
            blurb="Top 20 tool names by tokens recorded directly on tool_call events. Most tools record zero tokens here — the call count column is usually the meaningful one."
          >
            {byTool.length === 0 ? (
              <Empty>No tool_call events in window.</Empty>
            ) : (
              <Table head={["Tool", "Input", "Output", "Calls"]}>
                {byTool.map((r) => (
                  <tr key={r.toolName} className="border-t border-white/10">
                    <Td mono>{r.toolName}</Td>
                    <Td right>{fmtNum(r.inputTokens)}</Td>
                    <Td right>{fmtNum(r.outputTokens)}</Td>
                    <Td right>{fmtNum(r.callCount)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card
            title="Tokens by model"
            blurb="Are you on opus when sonnet or haiku would do? Group by the model recorded on each event."
          >
            {byModel.length === 0 ? (
              <Empty>No events with model in window.</Empty>
            ) : (
              <Table head={["Model", "Input", "Output", "Cache read", "Events"]}>
                {byModel.map((r) => (
                  <tr key={r.model} className="border-t border-white/10">
                    <Td mono>{r.model}</Td>
                    <Td right>{fmtNum(r.inputTokens)}</Td>
                    <Td right>{fmtNum(r.outputTokens)}</Td>
                    <Td right>{fmtNum(r.cacheReadTokens)}</Td>
                    <Td right>{fmtNum(r.eventCount)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card
            title="Cache hit ratio"
            blurb="Cache-read tokens as a share of all input. Higher is cheaper. Most users don't even know if caching is on."
          >
            <ul className="text-sm space-y-2">
              <li className="flex justify-between">
                <span className="text-zinc-400">Hit ratio</span>
                <span className="font-mono tabular-nums text-[#a7f300]">
                  {fmtPct(cache.hitRatio)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Total input tokens</span>
                <span className="font-mono tabular-nums text-zinc-200">
                  {fmtNum(cache.totalInputTokens)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Cache read tokens</span>
                <span className="font-mono tabular-nums text-zinc-200">
                  {fmtNum(cache.cacheReadTokens)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Cache creation tokens</span>
                <span className="font-mono tabular-nums text-zinc-200">
                  {fmtNum(cache.cacheCreationTokens)}
                </span>
              </li>
            </ul>
          </Card>

          <Card
            title="Cost by outcome"
            blurb="How much you spent on sessions that shipped vs got abandoned vs went down a rabbithole. The abandoned number is usually the eye-opener. $0.00 rows are sessions captured before per-event token capture landed (Week 0 pivot, mid-May 2026)."
          >
            {byOutcome.length === 0 ? (
              <Empty>No sessions in window.</Empty>
            ) : (
              <Table head={["Outcome", "Sessions", "Cost"]}>
                {byOutcome.map((r) => (
                  <tr key={r.outcome} className="border-t border-white/10">
                    <Td mono>{r.outcome}</Td>
                    <Td right>{fmtNum(r.sessionCount)}</Td>
                    <Td right tabular>
                      {fmtUsd(r.totalCostUsd)}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card
            title="Top expensive sessions"
            blurb="The 10 single sessions that cost you the most. Click into any of them to see exactly what happened."
          >
            {topSessions.length === 0 ? (
              <Empty>No costed sessions in window.</Empty>
            ) : (
              <Table head={["Session", "Outcome", "Cost"]}>
                {topSessions.map((r) => (
                  <tr key={r.slug} className="border-t border-white/10">
                    <td className="px-3 py-2.5 text-zinc-200">
                      <Link
                        href={`/u/${user}/${r.slug}`}
                        className="inline-block max-w-[28ch] truncate transition-colors hover:text-[#a7f300]"
                        title={r.title ?? r.slug}
                      >
                        {r.title ?? r.slug}
                      </Link>
                      <div className="text-[11px] font-mono text-zinc-600 truncate">
                        {r.tool} · {r.startedAt.toISOString().slice(0, 10)}
                      </div>
                    </td>
                    <Td mono>{r.outcome ?? "—"}</Td>
                    <Td right tabular>
                      {fmtUsd(r.estimatedCostUsd)}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <AuditFooter
          userPlan={userRow.plan}
          optedIn={userRow.spendAuditOptIn}
          windowDays={windowDays}
          existingAudit={existingAudit}
        />
      </main>
    </div>
  );
}

function Card({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.5rem] bg-zinc-950/70 p-5 shadow-[var(--trail-shadow-border)]">
      <div className="mb-3">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-100">{title}</h2>
        <p className="text-[12px] text-zinc-500 mt-1 leading-snug">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl shadow-[var(--trail-shadow-border)]">
      <table className="w-full text-[13px]">
        <thead className="bg-zinc-900/60">
          <tr className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-3 py-2 font-normal ${i === 0 ? "text-left" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({
  children,
  right,
  mono,
  tabular,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
  tabular?: boolean;
}) {
  const cls = [
    "px-3 py-2.5",
    right ? "text-right" : "text-left",
    mono ? "font-mono text-[12px] text-zinc-300" : "text-zinc-300",
    tabular ? "tabular-nums" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <td className={cls}>{children}</td>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl px-4 py-6 text-center font-mono text-[12px] text-zinc-600 shadow-[var(--trail-shadow-border)]">
      {children}
    </div>
  );
}
