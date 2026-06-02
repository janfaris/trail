"use client";

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
  runs: RunRow[];
};

const SECRET_KEY = "radar_admin_secret";

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

export default function RadarAdminPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    const saved = window.localStorage.getItem(SECRET_KEY);
    if (saved) setSecret(saved);
  }, []);

  const loadStatus = useCallback(async (key: string) => {
    if (!key) {
      setError("Enter the cron secret first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/radar/status?limit=20", {
        headers: { authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json as StatusResponse);
      window.localStorage.setItem(SECRET_KEY, key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const runNow = useCallback(async () => {
    if (!secret) {
      setError("Enter the cron secret first.");
      return;
    }
    setRunning(true);
    setRunLog(null);
    setError(null);
    try {
      const res = await fetch(`/api/cron/radar/fetch?limit=${limit}`, {
        headers: { authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setRunLog(
        `Fetched ${json.fetchedCount} / stored ${json.storedCount} across ` +
          `${json.sourcesAttempted ?? json.sourcesCount} sources · ${json.failureCount} failures · ${json.status}`,
      );
      await loadStatus(secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }, [secret, limit, loadStatus]);

  const nextRunRel = useMemo(() => (data ? rel(data.nextRun) : "—"), [data]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 text-zinc-200">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Radar admin</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Monitor the hourly X ingestion cron and trigger a manual fetch.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cron secret
          </span>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="RADAR_CRON_SECRET or CRON_SECRET"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
        </label>
        <button
          type="button"
          onClick={() => loadStatus(secret)}
          disabled={loading}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load status"}
        </button>
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
              value={String(data.totals.total)}
              sub={`${data.totals.today} today`}
            />
            <Stat
              label="Newest tweet"
              value={rel(data.totals.newestPublishedAt)}
              sub="by publish time"
            />
          </div>

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
