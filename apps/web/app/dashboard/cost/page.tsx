// /dashboard/cost — Week 5 cost-per-PR pivot.
//
// Server component. Reads session_cost_attribution via aggregateCost() and
// renders the per-PR cost ledger for a 7/30/90 day window.
//
// Tone matches /settings/connections: zinc-950 surface, mono labels with the
// #a7f300 accent. No client component — the window selector is a Next Link.
//
// We pass tier='cost-monthly' as metadata even for arbitrary windows. The
// tier is just a label here; the real differentiator is windowStart/End.

import { SiteNav } from "@/components/site-nav";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_WINDOWS = [7, 30, 90] as const;
type AllowedWindow = (typeof ALLOWED_WINDOWS)[number];

type VendorSlot = "anthropic" | "openai" | "cursor" | "copilot";
const VENDOR_SLOTS: { id: VendorSlot; name: string; line: string }[] = [
  { id: "anthropic", name: "Anthropic", line: "Claude API org usage." },
  { id: "openai", name: "OpenAI", line: "OpenAI org spend." },
  { id: "cursor", name: "Cursor", line: "Cursor team usage." },
  { id: "copilot", name: "GitHub Copilot", line: "Copilot seat usage." },
];

function parseWindow(raw: string | string[] | undefined): AllowedWindow {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  if ((ALLOWED_WINDOWS as readonly number[]).includes(n)) return n as AllowedWindow;
  return 30;
}

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  // Display rounding: 2 decimals. Storage stays at 6.
  return `$${n.toFixed(2)}`;
}

function fmtMoneyCompact(n: number): string {
  if (!Number.isFinite(n)) return "$—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

// Hourly cron at :15 past the hour. Compute the next occurrence in UTC so
// the empty-state copy isn't ambiguous about timezones.
function nextQuarterPast(now: Date): Date {
  const next = new Date(now);
  next.setUTCMinutes(15, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCHours(next.getUTCHours() + 1);
  }
  return next;
}

function fmtRelativeMinutes(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "any minute now";
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.round(mins / 60);
  return `in ${hrs} hour${hrs === 1 ? "" : "s"}`;
}

function fmtLastSync(d: Date | null): string {
  if (!d) return "never";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function CostDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const [{ headers }, { eq }, { auth }, { db, schema }, { aggregateCost }] = await Promise.all([
    import("next/headers"),
    import("drizzle-orm"),
    import("@/lib/auth"),
    import("@/db/client"),
    import("@/lib/recap/cost-aggregate"),
  ]);
  // BetterAuth preview-origin defense — see /settings/connections for the
  // canonical pattern. Treat throws/null as unauthenticated.
  let sess: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    sess = await auth.api.getSession({ headers: await headers() });
  } catch {
    sess = null;
  }
  if (!sess?.user) redirect("/");

  const me = await db.query.user.findFirst({
    where: eq(schema.user.id, sess.user.id),
    columns: { handle: true, plan: true },
  });
  const isFree = (me?.plan ?? "free") === "free";

  const sp = await searchParams;
  // Free tier: clamp window to 30d max regardless of query string. Cheaper
  // queries, simpler upgrade story ("see lifetime cost with Pro"). Paid
  // tiers honor the 7/30/90 selector unchanged.
  const requested = parseWindow(sp?.window);
  const windowDays = isFree ? Math.min(requested, 30) : requested;
  const now = new Date();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const payload = await aggregateCost({
    userId: sess.user.id,
    windowStart,
    windowEnd,
    tier: "cost-monthly",
  });

  const m = payload.metrics;
  const showUnattributed = m.unattributedCostUsd > 0.5;
  const hasData = m.shippedPrCount > 0 && m.totalCostUsd > 0;

  // Connections + local-session signal drive the empty-state ladder when
  // there's no cost-per-PR data yet.
  const connections = await db
    .select({
      vendor: schema.vendorConnection.vendor,
      lastSyncedAt: schema.vendorConnection.lastSyncedAt,
    })
    .from(schema.vendorConnection)
    .where(eq(schema.vendorConnection.userId, sess.user.id));
  const hasConnections = connections.length > 0;
  const lastSyncedAt = connections.reduce<Date | null>((acc, c) => {
    if (!c.lastSyncedAt) return acc;
    if (!acc || c.lastSyncedAt.getTime() > acc.getTime()) return c.lastSyncedAt;
    return acc;
  }, null);
  const nextSyncAt = nextQuarterPast(now);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.08),transparent_24rem),#050505] text-zinc-100">
      <SiteNav currentPath="/dashboard/cost" />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 lg:px-10">
        <div className="mb-8 rounded-[2rem] bg-black/55 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
            Trail · cost ledger
          </div>
          <h1 className="mb-2 mt-3 text-4xl font-semibold leading-none tracking-[-0.07em] text-white sm:text-5xl">
            Cost per PR
          </h1>
          <p className="max-w-xl text-sm leading-6 text-zinc-400">
            What your shipped PRs actually cost, measured in real dollars from your vendor APIs and
            per-event token counts. Read-only - receipts and attribution are computed upstream.
          </p>
        </div>

        {!hasData && !hasConnections && <ConnectEmptyState lastSyncedAt={lastSyncedAt} />}

        {!hasData && hasConnections && (
          <SyncPendingState
            now={now}
            nextSyncAt={nextSyncAt}
            lastSyncedAt={lastSyncedAt}
            connectionCount={connections.length}
          />
        )}

        {hasData && (
          <>
            {/* Window selector */}
            <div className="mb-8 flex flex-wrap items-center gap-2">
              {ALLOWED_WINDOWS.map((d) => {
                const active = d === windowDays;
                const locked = isFree && d > 30;
                if (locked) {
                  return (
                    <Link
                      key={d}
                      href="/pricing"
                      title="Upgrade to Pro to unlock 90-day cost history"
                      className="inline-flex min-h-10 items-center rounded-full bg-white/[0.04] px-4 font-mono text-xs text-zinc-300 transition-[color,transform] hover:text-[#a7f300] active:scale-[0.97]"
                    >
                      {d}d · pro
                    </Link>
                  );
                }
                return (
                  <Link
                    key={d}
                    href={`/dashboard/cost?window=${d}`}
                    className={`inline-flex min-h-10 items-center rounded-full px-4 font-mono text-xs transition-[box-shadow,color,background-color,transform] active:scale-[0.97] ${
                      active
                        ? "bg-[#a7f300]/10 text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.3)]"
                        : "bg-white/[0.04] text-zinc-300 hover:text-zinc-100"
                    }`}
                  >
                    {d}d
                  </Link>
                );
              })}
              <span className="ml-3 text-[11px] font-mono text-zinc-600">
                {windowStart.toISOString().slice(0, 10)} → {windowEnd.toISOString().slice(0, 10)}
              </span>
            </div>

            {/* Top stat strip */}
            <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-5">
              <BigStat label="$/PR" value={fmtMoney(m.avgCostPerPrUsd)} accent hero />
              <BigStat label="Shipped PRs" value={String(m.shippedPrCount)} />
              <BigStat label="Total cost" value={fmtMoney(m.totalCostUsd)} />
              <BigStat
                label="Top vendor"
                value={m.topVendorByCost?.vendor ?? "—"}
                sub={m.topVendorByCost ? fmtMoney(m.topVendorByCost.costUsd) : undefined}
              />
              <BigStat
                label="Top model"
                value={m.topModelByCost?.model ?? "—"}
                sub={
                  m.topModelByCost
                    ? `${m.topModelByCost.vendor} · ${fmtMoney(m.topModelByCost.costUsd)}`
                    : undefined
                }
              />
            </div>

            {/* Unattributed callout */}
            {showUnattributed && (
              <div className="mb-10 rounded-[1.5rem] bg-amber-500/[0.04] px-5 py-4 shadow-[0_0_0_1px_rgba(245,158,11,0.22)]">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300/80">
                  Unattributed spend
                </div>
                <div className="text-sm text-zinc-300">
                  You spent{" "}
                  <span className="font-mono tabular-nums text-amber-300">
                    {fmtMoney(m.unattributedCostUsd)}
                  </span>{" "}
                  on AI vendors that didn't tie to a shipped PR. That's research or exploration cost
                  — not a bug.
                </div>
              </div>
            )}

            {/* Per-PR table */}
            <Section title="Per-PR cost">
              {payload.breakdown.perPr.length === 0 ? (
                <div className="rounded-[1.5rem] p-8 text-center shadow-[var(--trail-shadow-border)]">
                  <div className="mb-2 font-mono text-sm text-zinc-400">
                    No shipped PRs in window.
                  </div>
                  <div className="mx-auto max-w-md text-xs text-zinc-600">
                    Connect a vendor in{" "}
                    <Link href="/settings/connections" className="text-[#a7f300] hover:underline">
                      /settings/connections
                    </Link>{" "}
                    and ship a PR linked to a session to see real $/PR data here.
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[1.5rem] shadow-[var(--trail-shadow-border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900/60">
                      <tr className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                        <th className="text-left px-4 py-3 font-normal">PR</th>
                        <th className="text-left px-4 py-3 font-normal">Title</th>
                        <th className="text-right px-4 py-3 font-normal">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.breakdown.perPr.map((p) => (
                        <tr key={p.prUrl} className="border-t border-white/10 hover:bg-zinc-900/40">
                          <td className="px-4 py-3 font-mono text-[12px]">
                            <a
                              href={p.prUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-block max-w-[24ch] truncate text-zinc-300 transition-colors hover:text-[#a7f300]"
                            >
                              {prShortLabel(p.prUrl)}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-zinc-400 truncate max-w-[40ch]">
                            {p.title ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-100">
                            {fmtMoney(p.costUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Per-vendor + per-model side-by-side */}
            <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
              <Section title="Per-vendor">
                {payload.breakdown.perVendor.length === 0 ? (
                  <EmptyHint>No vendor cost in window.</EmptyHint>
                ) : (
                  <ul className="space-y-3">
                    {payload.breakdown.perVendor.map((v) => (
                      <li key={v.vendor}>
                        <div className="flex items-baseline justify-between text-[13px] mb-1">
                          <span className="font-mono text-zinc-200">{v.vendor}</span>
                          <span className="font-mono tabular-nums text-zinc-400">
                            {fmtMoneyCompact(v.costUsd)}{" "}
                            <span className="text-zinc-600">· {(v.share * 100).toFixed(0)}%</span>
                          </span>
                        </div>
                        {/* Simple inline bar — no chart lib, matches existing pages. */}
                        <div className="h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className="h-full bg-[#a7f300]/70"
                            style={{
                              width: `${Math.max(2, Math.min(100, v.share * 100)).toFixed(2)}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Per-model">
                {payload.breakdown.perModel.length === 0 ? (
                  <EmptyHint>No model cost in window.</EmptyHint>
                ) : (
                  <ul className="space-y-2">
                    {payload.breakdown.perModel.slice(0, 10).map((mm) => (
                      <li
                        key={`${mm.vendor}::${mm.model}`}
                        className="flex items-baseline justify-between text-[13px]"
                      >
                        <span className="font-mono truncate max-w-[24ch]">
                          <span className="text-zinc-200">{mm.model}</span>{" "}
                          <span className="text-zinc-600">/ {mm.vendor}</span>
                        </span>
                        <span className="font-mono tabular-nums text-zinc-400">
                          {fmtMoneyCompact(mm.costUsd)}{" "}
                          <span className="text-zinc-600">· {(mm.share * 100).toFixed(0)}%</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </>
        )}

        {/* Footer hint */}
        <div className="mt-16 flex items-center justify-between rounded-[1.5rem] bg-black/35 p-5 font-mono text-[11px] text-zinc-600 shadow-[var(--trail-shadow-border)]">
          <span>
            handle <span className="text-zinc-400">@{me?.handle ?? "you"}</span>
          </span>
          <span>tier · cost-monthly</span>
        </div>
      </main>
    </div>
  );
}

function ConnectEmptyState({
  lastSyncedAt,
}: {
  lastSyncedAt: Date | null;
}) {
  return (
    <section className="mb-10">
      <div className="rounded-[2rem] bg-zinc-950/70 px-6 py-7 shadow-[var(--trail-shadow-border)]">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          Start tracking your $/PR
        </div>
        <p className="mb-5 max-w-2xl text-sm leading-6 text-zinc-300">
          Trail prices each AI session against current per-token rates and links the cost to the
          merged commit. Local capture is the default path - no admin keys required for Claude Code
          or Codex.
        </p>

        <div className="mb-6 max-w-3xl rounded-[1.5rem] bg-[#a7f300]/5 p-5 shadow-[0_0_0_1px_rgba(167,243,0,0.24)]">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
              Recommended · No keys
            </span>
          </div>
          <div className="mb-3 text-base font-medium text-zinc-50">Install the CLI</div>
          <div className="mb-3 flex min-h-11 items-center overflow-x-auto rounded-2xl bg-zinc-950 px-4 font-mono text-[13px] text-zinc-200 shadow-[var(--trail-shadow-border)]">
            <span className="mr-2 select-none text-zinc-600">$</span>
            <span className="break-all">npm install -g @gettrail/cli</span>
          </div>
          <div className="text-[12.5px] leading-relaxed text-zinc-400">
            Tails Claude Code + Codex log files locally. Tokens captured per turn, priced at upload
            time, attributed to the merge commit when you ship.{" "}
            <Link href="/install" className="text-[#a7f300] hover:underline">
              Full setup →
            </Link>
          </div>
        </div>

        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          Or — connect an admin key for org-wide reconciliation
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VENDOR_SLOTS.map((v) => (
            <div
              key={v.id}
              className="flex flex-col gap-2 rounded-[1.25rem] bg-zinc-950/60 px-4 py-3.5 shadow-[var(--trail-shadow-border)]"
            >
              <div className="text-sm font-semibold text-zinc-100">{v.name}</div>
              <div className="text-xs text-zinc-500">{v.line}</div>
              <Link
                href="/settings/connections"
                className="mt-1 inline-flex min-h-9 items-center justify-center rounded-full bg-zinc-900 px-3 font-mono text-xs text-zinc-100 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
              >
                Add connection
              </Link>
            </div>
          ))}
        </div>

        {lastSyncedAt && (
          <div className="mt-3 font-mono text-[11px] text-zinc-600">
            Last vendor sync · {fmtLastSync(lastSyncedAt)}
          </div>
        )}
      </div>
    </section>
  );
}

function SyncPendingState({
  now,
  nextSyncAt,
  lastSyncedAt,
  connectionCount,
}: {
  now: Date;
  nextSyncAt: Date;
  lastSyncedAt: Date | null;
  connectionCount: number;
}) {
  const rel = fmtRelativeMinutes(nextSyncAt, now);
  const nextStamp = `${nextSyncAt.toISOString().slice(11, 16)} UTC`;
  return (
    <section className="mb-10">
      <div className="rounded-[2rem] bg-zinc-950/70 px-6 py-6 shadow-[var(--trail-shadow-border)]">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          Sync in progress
        </div>
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-zinc-50">
          We're pulling your vendor usage now.
        </h2>
        <p className="mb-4 max-w-2xl text-sm leading-6 text-zinc-400">
          The hourly cron runs at :15 past every hour and stitches your vendor usage to your shipped
          PRs. Check back at the next :15 past the hour to see your real $/PR.
        </p>
        <div className="grid grid-cols-1 gap-3 font-mono text-xs sm:grid-cols-3">
          <div className="rounded-2xl bg-black/35 px-3 py-2.5 shadow-[var(--trail-shadow-border)]">
            <div className="mb-1 text-zinc-500">Connections</div>
            <div className="text-base font-semibold tabular-nums text-zinc-100">
              {connectionCount}
            </div>
          </div>
          <div className="rounded-2xl bg-black/35 px-3 py-2.5 shadow-[var(--trail-shadow-border)]">
            <div className="mb-1 text-zinc-500">Last sync</div>
            <div className="text-zinc-100">{fmtLastSync(lastSyncedAt)}</div>
          </div>
          <div className="rounded-2xl bg-black/35 px-3 py-2.5 shadow-[var(--trail-shadow-border)]">
            <div className="mb-1 text-zinc-500">Next sync</div>
            <div className="text-[#a7f300]">
              {nextStamp} <span className="text-zinc-500">· {rel}</span>
            </div>
          </div>
        </div>
        <div className="mt-5 font-mono text-[11px] text-zinc-600">
          Once a shipped PR lands inside a synced bucket, it'll show up here automatically.
        </div>
      </div>
    </section>
  );
}

function BigStat({
  label,
  value,
  sub,
  accent,
  hero,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  hero?: boolean;
}) {
  return (
    <div className="rounded-[1.35rem] bg-zinc-950/70 px-4 py-3.5 shadow-[var(--trail-shadow-border)]">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div
        className={`${
          hero ? "text-3xl font-semibold tabular-nums" : "text-xl font-semibold tabular-nums"
        } ${accent ? "text-[#a7f300]" : "text-zinc-100"}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
        {title}
      </div>
      <div className="rounded-[1.5rem] bg-zinc-950/70 p-5 shadow-[var(--trail-shadow-border)]">
        {children}
      </div>
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[12px] text-zinc-600">{children}</div>;
}

function prShortLabel(url: string): string {
  // https://github.com/owner/repo/pull/123 → owner/repo#123
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // [owner, repo, 'pull', '<n>']
    if (parts.length >= 4 && parts[2] === "pull") {
      return `${parts[0]}/${parts[1]}#${parts[3]}`;
    }
    return u.pathname;
  } catch {
    return url;
  }
}
