"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type RunRow = {
  id: string;
  trigger: string;
  status: string;
  sourcesCount: number;
  fetchedCount: number;
  storedCount: number;
  failureCount: number;
  failures: { source?: string; message?: string }[];
  startedAt: string | null;
  finishedAt: string | null;
};

type StatusResponse = {
  ok: true;
  now: string;
  schedule: string;
  nextRun: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  totals: {
    total: number;
    today: number;
    newestPublishedAt: string | null;
    lastFetchedAt: string | null;
  };
  sourceBreakdown: Array<{
    handle: string;
    name: string;
    role: string;
    priority: number;
    active: boolean;
    total: number;
    pulledToday: number;
    newestPublishedAt: string | null;
    lastFetchedAt: string | null;
  }>;
  xApiUsage: {
    sourceCount: number;
    scheduledRunsPerDay: number;
    scheduledRequestsPerRun: number;
    scheduledRequestsPerDay: number;
    maxResultsPerSource: number;
    maxPostReadsPerDay: number;
    manualRunRequests: number;
  };
  runs: RunRow[];
};

const X_POST_READ_USD = 0.005;

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 10 ? 0 : 2,
  }).format(value);
}

function int(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function rel(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = t - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  let span: string;
  if (abs < 60_000) span = "just now";
  else if (mins < 60) span = `${mins}m`;
  else if (hrs < 24) span = `${hrs}h`;
  else span = `${days}d`;
  if (span === "just now") return span;
  return diff >= 0 ? `in ${span}` : `${span} ago`;
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "success"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : status === "partial"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : status === "running"
          ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
          : "bg-red-500/15 text-red-400 border-red-500/30";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>
  );
}

export default function RadarAdminClient({ adminLabel }: { adminLabel: string }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/radar/status?limit=20", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json as StatusResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  // Session-gated: load on mount, no secret needed.
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runNow = useCallback(async () => {
    setRunning(true);
    setRunLog(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/radar/run?limit=${limit}`, {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setRunLog(
        `Fetched ${json.fetchedCount} / stored ${json.storedCount} across ` +
          `${json.sourcesAttempted ?? json.sourcesCount} sources · ${json.failureCount} failures · ${json.status}`,
      );
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }, [limit, loadStatus]);

  const nextRunRel = useMemo(() => (data ? rel(data.nextRun) : "—"), [data]);
  const apiCost = useMemo(() => {
    if (!data) return null;
    const pulledToday = data.sourceBreakdown.reduce((sum, source) => sum + source.pulledToday, 0);
    const manualMaxPostReads =
      data.xApiUsage.manualRunRequests * data.xApiUsage.maxResultsPerSource;
    return {
      pulledToday,
      observedToday: pulledToday * X_POST_READ_USD,
      scheduledMax: data.xApiUsage.maxPostReadsPerDay * X_POST_READ_USD,
      manualMax: manualMaxPostReads * X_POST_READ_USD,
      manualMaxPostReads,
    };
  }, [data]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 text-zinc-200">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Radar admin</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Monitor the hourly X ingestion cron and trigger a manual fetch.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden text-xs text-zinc-500 sm:inline">{adminLabel}</span>
          <button
            type="button"
            onClick={() => loadStatus()}
            disabled={loading}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Next run" value={nextRunRel} sub={new Date(data.nextRun).toUTCString()} />
            <Stat label="Last run" value={rel(data.lastRunAt)} sub={data.schedule} />
            <Stat
              label="Signals"
              value={int(data.totals.total)}
              sub={`${int(data.totals.today)} today`}
            />
            <Stat
              label="Newest tweet"
              value={rel(data.totals.newestPublishedAt)}
              sub="by publish time"
            />
          </div>

          {apiCost && (
            <div className="mb-8 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                      X API estimate
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      Current cron: {data.xApiUsage.sourceCount} active sources ×{" "}
                      {data.xApiUsage.scheduledRunsPerDay} scheduled runs/day.
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#a7f300]/30 bg-[#a7f300]/10 px-3 py-2 text-right">
                    <div className="text-xs uppercase tracking-wide text-[#a7f300]">
                      Scheduled requests/day
                    </div>
                    <div className="mt-0.5 text-lg font-semibold text-zinc-100">
                      {int(data.xApiUsage.scheduledRequestsPerDay)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Stat
                    label="Per run"
                    value={`${int(data.xApiUsage.scheduledRequestsPerRun)} requests`}
                    sub="1 recent-search call per source"
                  />
                  <Stat
                    label="Max post reads"
                    value={int(data.xApiUsage.maxPostReadsPerDay)}
                    sub={`${data.xApiUsage.maxResultsPerSource} max results/request`}
                  />
                  <Stat
                    label="Manual run adds"
                    value={`${int(apiCost.manualMaxPostReads)} max reads`}
                    sub={`${money(apiCost.manualMax)} max`}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  X charges read operations per Post resource returned, not simply per request.
                  Using the current posted rate of {money(X_POST_READ_USD)} per Post read:{" "}
                  <span className="text-zinc-300">{money(apiCost.scheduledMax)} per day max</span>{" "}
                  if every scheduled request returns {data.xApiUsage.maxResultsPerSource} new or
                  non-deduped posts. Confirm exact rates in your X billing dashboard.
                </p>
              </section>
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Estimated cost today
                </h2>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
                  {money(apiCost.observedToday)}
                  <span className="ml-1 text-sm font-normal text-zinc-500">so far</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Based on {int(apiCost.pulledToday)} unique stored posts fetched today. X says
                  duplicate reads of the same resource are deduplicated within a 24-hour UTC window,
                  so actual billed reads should track unique posts more closely than raw requests.
                </p>
              </section>
            </div>
          )}

          <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Per-source limit
              </span>
              <input
                type="number"
                min={10}
                max={100}
                value={limit}
                onChange={(e) =>
                  setLimit(Math.min(100, Math.max(10, Number(e.target.value) || 10)))
                }
                className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
            </div>
            <button
              type="button"
              onClick={runNow}
              disabled={running}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {running ? "Running…" : "Run fetch now"}
            </button>
            {runLog && <span className="text-sm text-zinc-400">{runLog}</span>}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Pulled tweets by source
          </h2>
          <div className="mb-8 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2 text-right">Pulled today</th>
                  <th className="px-3 py-2 text-right">Total stored</th>
                  <th className="px-3 py-2">Latest pull</th>
                  <th className="px-3 py-2">Newest tweet</th>
                  <th className="px-3 py-2 text-right">Tweets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.sourceBreakdown.map((source) => (
                  <tr key={source.handle} className="text-zinc-300">
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-100">@{source.handle}</div>
                      <div className="max-w-[260px] truncate text-xs text-zinc-500">
                        {source.name} · {source.role}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          source.active
                            ? "border-[#a7f300]/30 bg-[#a7f300]/10 text-[#a7f300]"
                            : "border-zinc-700 bg-zinc-800/70 text-zinc-500"
                        }`}
                      >
                        {source.active ? "active" : "paused"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{int(source.pulledToday)}</td>
                    <td className="px-3 py-2 text-right">{int(source.total)}</td>
                    <td className="px-3 py-2" title={source.lastFetchedAt ?? ""}>
                      {rel(source.lastFetchedAt)}
                    </td>
                    <td className="px-3 py-2" title={source.newestPublishedAt ?? ""}>
                      {rel(source.newestPublishedAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/radar?source=${encodeURIComponent(source.handle)}`}
                        className="text-[#a7f300] hover:text-[#c8ff4d]"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Recent runs
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Sources</th>
                  <th className="px-3 py-2 text-right">Fetched</th>
                  <th className="px-3 py-2 text-right">Stored</th>
                  <th className="px-3 py-2 text-right">Failures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.runs.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-zinc-500" colSpan={7}>
                      No runs recorded yet.
                    </td>
                  </tr>
                )}
                {data.runs.map((r) => (
                  <tr key={r.id} className="text-zinc-300">
                    <td className="px-3 py-2" title={r.startedAt ?? ""}>
                      {rel(r.startedAt)}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{r.trigger}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-right">{r.sourcesCount}</td>
                    <td className="px-3 py-2 text-right">{r.fetchedCount}</td>
                    <td className="px-3 py-2 text-right">{r.storedCount}</td>
                    <td className="px-3 py-2 text-right">{r.failureCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            All times shown relative to now. Schedule <code>{data.schedule}</code> runs in UTC.
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
