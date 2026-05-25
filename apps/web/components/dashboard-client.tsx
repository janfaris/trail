"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { bulkSetVisibility, bulkSetOutcome, bulkDeleteSessions } from "@/app/u/[user]/actions";

export type SessionRow = {
  id: string;
  slug: string;
  title: string | null;
  tool: string | null;
  eventCount: number;
  startedAt: string; // ISO
  visibility: string;
  outcome: string | null;
  linkedRepo: string | null;
  linkedCommitSha: string | null;
  receiptStatus: string | null;
  receiptVerifiedSha: string | null;
};

type Filter = "all" | "shipped" | "has-commit" | "needs-review" | "private";

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  shipped: "Shipped",
  "has-commit": "Has commit",
  "needs-review": "Needs review",
  private: "Private",
};

const VIS_LABEL: Record<string, string> = {
  public: "Public",
  private: "Private",
  pending: "Pending",
  redacted: "Redacted",
};

function visTone(v: string): string {
  if (v === "public") return "text-[#a7f300] bg-[#a7f300]/10 border-[#a7f300]/30";
  if (v === "private") return "text-zinc-400 bg-zinc-900 border-zinc-800";
  if (v === "pending") return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-rose-400 bg-rose-500/10 border-rose-500/30";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export function DashboardClient({
  rows,
  handle,
}: {
  rows: SessionRow[];
  handle: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "shipped")
      return r.receiptStatus === "shipped" || r.receiptVerifiedSha !== null;
    if (filter === "has-commit") return r.linkedCommitSha !== null;
    if (filter === "needs-review")
      return r.receiptStatus === "draft" || r.receiptStatus === null;
    if (filter === "private") return r.visibility === "private";
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      filtered.forEach((r) => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((r) => next.add(r.id));
      setSelected(next);
    }
  }

  function run(label: string, fn: () => Promise<{ ok: boolean; updated?: number; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setFlash(`${label}: ${result.updated ?? 0} session(s) updated`);
        setSelected(new Set());
      } else {
        setFlash(`error: ${result.error}`);
      }
      setTimeout(() => setFlash(null), 3500);
    });
  }

  function runDelete() {
    const n = ids.length;
    if (n === 0) return;
    const ok = window.confirm(
      `Delete ${n} session(s)? This permanently removes them and all linked events. This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await bulkDeleteSessions(ids);
      if (result.ok) {
        setFlash(`Deleted ${result.deleted} session(s)`);
        setSelected(new Set());
        // Server actions revalidate the dashboard route; force a client
        // refresh too so the deleted rows disappear immediately.
        window.location.reload();
      } else {
        setFlash(`error: ${("error" in result && result.error) || "delete failed"}`);
      }
      setTimeout(() => setFlash(null), 3500);
    });
  }

  const ids = [...selected];
  const hasSelection = ids.length > 0;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 bg-zinc-950/95 backdrop-blur py-3 -mx-6 px-6 border-b border-zinc-900 z-10">
        <div className="flex items-center gap-2 text-xs font-mono">
          {(["all", "shipped", "has-commit", "needs-review", "private"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded ${
                filter === f
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
          <span className="text-zinc-700 ml-2">·</span>
          <span className="text-zinc-500 ml-1">
            {filtered.length} shown · {selected.size} selected
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            disabled={!hasSelection || pending}
            onClick={() => run("Made public", () => bulkSetVisibility(ids, "public"))}
            className="font-mono px-2.5 py-1 rounded bg-[#a7f300] text-zinc-950 font-semibold disabled:opacity-30 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            Make public
          </button>
          <button
            disabled={!hasSelection || pending}
            onClick={() => run("Made private", () => bulkSetVisibility(ids, "private"))}
            className="font-mono px-2.5 py-1 rounded border border-zinc-800 text-zinc-300 hover:border-zinc-600 disabled:opacity-30"
          >
            Make private
          </button>
          <span className="text-zinc-800">|</span>
          <button
            disabled={!hasSelection || pending}
            onClick={() => run("Marked shipped", () => bulkSetOutcome(ids, "shipped"))}
            className="font-mono px-2.5 py-1 rounded border border-zinc-800 text-zinc-300 hover:border-zinc-600 disabled:opacity-30"
          >
            Mark shipped
          </button>
          <button
            disabled={!hasSelection || pending}
            onClick={() => run("Cleared outcome", () => bulkSetOutcome(ids, null))}
            className="font-mono px-2.5 py-1 rounded border border-zinc-800 text-zinc-500 hover:border-zinc-600 disabled:opacity-30"
          >
            Clear
          </button>
          <span className="text-zinc-800">|</span>
          <button
            disabled={!hasSelection || pending}
            onClick={runDelete}
            className="font-mono px-2.5 py-1 rounded border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/70 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Permanently delete the selected sessions"
          >
            {hasSelection ? `Delete selected (${ids.length})` : "Delete"}
          </button>
        </div>
      </div>

      {flash && (
        <div className="font-mono text-xs text-[#a7f300] border border-[#a7f300]/30 bg-[#a7f300]/5 rounded px-3 py-2">
          {flash}
        </div>
      )}

      {/* Table */}
      <div className="border border-zinc-900 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[32px_1fr_120px_90px_90px_70px] gap-4 px-4 py-2.5 border-b border-zinc-900 bg-zinc-950 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="accent-[#a7f300]"
          />
          <div>Title</div>
          <div>Tool</div>
          <div>Outcome</div>
          <div>Visibility</div>
          <div className="text-right">Events</div>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-zinc-500 font-mono">
            no sessions match this filter
          </div>
        )}

        {filtered.map((s) => {
          const isOn = selected.has(s.id);
          return (
            <div
              key={s.id}
              className={`grid grid-cols-[32px_1fr_120px_90px_90px_70px] gap-4 px-4 py-3 border-b border-zinc-900 last:border-b-0 text-sm hover:bg-zinc-950 ${
                isOn ? "bg-zinc-900/40" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => toggle(s.id)}
                className="accent-[#a7f300] mt-0.5"
              />
              <div className="min-w-0">
                <Link
                  href={`/u/${handle}/${s.slug}`}
                  className="text-zinc-100 hover:text-[#a7f300] block truncate"
                  title={s.title ?? s.slug}
                >
                  {s.title ?? s.slug}
                </Link>
                <div className="text-[11px] font-mono text-zinc-600 mt-0.5 flex items-center gap-2">
                  <span>{s.slug}</span>
                  <span>·</span>
                  <span>{fmtDate(s.startedAt)}</span>
                  {s.linkedRepo && (
                    <>
                      <span>·</span>
                      <span className="text-zinc-500">
                        {s.linkedRepo}
                        {s.linkedCommitSha ? `@${s.linkedCommitSha.slice(0, 7)}` : ""}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="font-mono text-[11px] text-zinc-400 self-center truncate">
                {s.tool ?? "—"}
              </div>
              <div className="self-center">
                <span
                  className={`font-mono text-[10px] uppercase tracking-wide ${
                    s.outcome === "shipped"
                      ? "text-[#a7f300]"
                      : s.outcome
                      ? "text-zinc-400"
                      : "text-zinc-600"
                  }`}
                >
                  {s.outcome ?? "—"}
                </span>
              </div>
              <div className="self-center">
                <span
                  className={`inline-block font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${visTone(
                    s.visibility,
                  )}`}
                >
                  {VIS_LABEL[s.visibility] ?? s.visibility}
                </span>
              </div>
              <div className="font-mono text-[11px] text-zinc-500 self-center text-right tabular-nums">
                {s.eventCount}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
