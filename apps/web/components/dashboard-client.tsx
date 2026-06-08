"use client";

import {
  bulkDeleteSessions,
  bulkSetOutcome,
  bulkSetVisibility,
  toggleFeatured,
} from "@/app/u/[user]/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export type SessionRow = {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string | null;
  postKind: string;
  eventCount: number;
  startedAt: string;
  endedAt: string | null;
  sharedAt: string | null;
  visibility: string;
  outcome: string | null;
  linkedRepo: string | null;
  linkedCommitSha: string | null;
  receiptStatus: string | null;
  receiptVerifiedSha: string | null;
  receiptGeneratedAt: string | null;
  receiptTldr: string | null;
  receiptOutcome: string | null;
  pendingReviewReasons: string[] | null;
  redactedAt: string | null;
  isFeatured: boolean;
  reactionCount: number;
  commentCount: number;
};

type Filter = "queue" | "live" | "private" | "blocked" | "featured" | "all";
type Plan = "free" | "pro";

type ActionResult = {
  ok: boolean;
  updated?: number;
  deleted?: number;
  error?: string;
};

type Lifecycle = {
  key:
    | "live"
    | "ready"
    | "review"
    | "receipt"
    | "recording"
    | "empty"
    | "limit"
    | "redacted"
    | "private";
  label: string;
  detail: string;
  tone: "lime" | "sky" | "amber" | "rose" | "zinc";
  canPublish: boolean;
  priority: number;
};

type DashboardClientProps = {
  rows: SessionRow[];
  handle: string;
  plan: Plan;
  livePublicCount: number;
  publicReceiptLimit: number;
};

const FILTER_LABEL: Record<Filter, string> = {
  queue: "Publishing queue",
  live: "Live posts",
  private: "Private drafts",
  blocked: "Needs attention",
  featured: "Featured",
  all: "All posts",
};

const VIS_LABEL: Record<string, string> = {
  public: "Public",
  private: "Private",
  pending: "Pending",
  redacted: "Redacted",
};

function getLifecycle(
  session: SessionRow,
  plan: Plan,
  livePublicCount: number,
  publicReceiptLimit: number,
): Lifecycle {
  const isManual = session.postKind === "manual_build";
  const hasReviewBlockers = (session.pendingReviewReasons?.length ?? 0) > 0;
  const isLive = session.visibility === "public" && session.sharedAt !== null;
  const freeLimitReached = plan !== "pro" && livePublicCount >= publicReceiptLimit;

  if (session.visibility === "redacted" || session.redactedAt !== null) {
    return {
      key: "redacted",
      label: "Redacted",
      detail: "Locked for safety. Keep it archived or delete it.",
      tone: "rose",
      canPublish: false,
      priority: 80,
    };
  }

  if (isLive) {
    return {
      key: "live",
      label: "Live on profile",
      detail: session.isFeatured
        ? "Featured proof is pinned on your profile."
        : "Shared with the network.",
      tone: "lime",
      canPublish: false,
      priority: session.isFeatured ? 50 : 45,
    };
  }

  // Manual build posts are written by the builder and don't run through the
  // agent-receipt pipeline (no recording, events, or generated receipt). A
  // private/unpublished one is simply ready to share again.
  if (isManual) {
    return {
      key: "ready",
      label: "Ready to publish",
      detail: "Written and ready to share on your profile and the feed.",
      tone: "sky",
      canPublish: true,
      priority: 2,
    };
  }

  if (session.endedAt === null) {
    return {
      key: "recording",
      label: "Still recording",
      detail: "Finish the session before you can publish it.",
      tone: "zinc",
      canPublish: false,
      priority: 42,
    };
  }

  if (session.eventCount <= 0) {
    return {
      key: "empty",
      label: "Empty session",
      detail: "No activity was captured in this session.",
      tone: "zinc",
      canPublish: false,
      priority: 43,
    };
  }

  if (session.receiptGeneratedAt === null) {
    return {
      key: "receipt",
      label: "Proof not ready",
      detail: "Open it and generate the proof before sharing.",
      tone: "amber",
      canPublish: false,
      priority: 12,
    };
  }

  if (hasReviewBlockers) {
    return {
      key: "review",
      label: "Needs review",
      detail: "Clear the safety checklist before this can go public.",
      tone: "amber",
      canPublish: false,
      priority: 10,
    };
  }

  if (freeLimitReached) {
    return {
      key: "limit",
      label: "Public limit reached",
      detail: `Free plans can keep ${publicReceiptLimit} posts public.`,
      tone: "sky",
      canPublish: false,
      priority: 18,
    };
  }

  return {
    key: "ready",
    label: "Ready to publish",
    detail: "Reviewed and eligible for your profile and the feed.",
    tone: "sky",
    canPublish: true,
    priority: 0,
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "not yet";
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function truncateCommit(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

function statusTone(tone: Lifecycle["tone"]): string {
  if (tone === "lime")
    return "border-[var(--accent-border)]/35 bg-[var(--accent)]/10 text-[var(--accent-text)]";
  if (tone === "sky") return "border-sky-400/35 bg-sky-400/10 text-sky-200";
  if (tone === "amber") return "border-amber-400/35 bg-amber-400/10 text-amber-200";
  if (tone === "rose") return "border-rose-400/35 bg-rose-400/10 text-rose-200";
  return "border-white/10 bg-zinc-900 text-zinc-400";
}

function visTone(visibility: string, sharedAt: string | null): string {
  if (visibility === "public" && sharedAt !== null) {
    return "border-[var(--accent-border)]/30 bg-[var(--accent)]/10 text-[var(--accent-text)]";
  }
  if (visibility === "public") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  if (visibility === "private") return "border-white/10 bg-zinc-900 text-zinc-400";
  if (visibility === "pending") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-rose-500/30 bg-rose-500/10 text-rose-300";
}

function filterMatches(filter: Filter, row: SessionRow, lifecycle: Lifecycle): boolean {
  if (filter === "all") return true;
  if (filter === "queue") return lifecycle.key !== "live" && lifecycle.key !== "redacted";
  if (filter === "live") return lifecycle.key === "live";
  if (filter === "private") return row.visibility === "private" || lifecycle.key === "ready";
  if (filter === "blocked") {
    return ["review", "receipt", "recording", "empty", "limit", "redacted"].includes(lifecycle.key);
  }
  if (filter === "featured") return row.isFeatured;
  return true;
}

function CardMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-black/35 px-3 py-2 shadow-[var(--trail-shadow-border)]">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-0.5 font-mono text-xs text-zinc-200">{value}</div>
    </div>
  );
}

function ChecklistChip({
  label,
  good,
}: {
  label: string;
  good: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
        good
          ? "border-[var(--accent-border)]/25 bg-[var(--accent)]/10 text-[var(--accent-text)]"
          : "border-white/10 bg-zinc-950 text-zinc-500"
      }`}
    >
      {good ? "✓" : "·"} {label}
    </span>
  );
}

export function DashboardClient({
  rows,
  handle,
  plan,
  livePublicCount,
  publicReceiptLimit,
}: DashboardClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("queue");
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  const rowsWithState = useMemo(
    () =>
      rows
        .map((row) => ({
          row,
          lifecycle: getLifecycle(row, plan, livePublicCount, publicReceiptLimit),
        }))
        .sort((a, b) => {
          if (a.lifecycle.priority !== b.lifecycle.priority) {
            return a.lifecycle.priority - b.lifecycle.priority;
          }
          return new Date(b.row.startedAt).getTime() - new Date(a.row.startedAt).getTime();
        }),
    [rows, plan, livePublicCount, publicReceiptLimit],
  );

  const filtered = rowsWithState.filter(({ row, lifecycle }) =>
    filterMatches(filter, row, lifecycle),
  );
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const ids = selectedRows.map((row) => row.id);
  const mutableIds = selectedRows
    .filter((row) => row.visibility !== "redacted" && row.redactedAt === null)
    .map((row) => row.id);
  const hasSelection = ids.length > 0;
  const hasMutableSelection = mutableIds.length > 0;
  const allSelected = filtered.length > 0 && filtered.every(({ row }) => selected.has(row.id));

  const publishReadyCount = rowsWithState.filter(({ lifecycle }) => lifecycle.canPublish).length;
  const blockedCount = rowsWithState.filter(({ lifecycle }) =>
    ["review", "receipt", "recording", "empty", "limit", "redacted"].includes(lifecycle.key),
  ).length;
  const engagementCount = rows.reduce(
    (total, row) => total + row.reactionCount + row.commentCount,
    0,
  );

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      for (const { row } of filtered) {
        next.delete(row.id);
      }
      setSelected(next);
      return;
    }

    const next = new Set(selected);
    for (const { row } of filtered) {
      next.add(row.id);
    }
    setSelected(next);
  }

  function showFlash(message: string) {
    setFlash(message);
    window.setTimeout(() => setFlash(null), 3500);
  }

  function run(label: string, selectedIds: string[], fn: () => Promise<ActionResult>) {
    if (selectedIds.length === 0) {
      showFlash("No eligible posts selected.");
      return;
    }

    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        const updated = result.updated ?? result.deleted ?? 0;
        showFlash(
          result.error
            ? `${label}: ${updated} post(s) updated. ${result.error}`
            : `${label}: ${updated} post(s) updated`,
        );
        setSelected(new Set());
        router.refresh();
      } else {
        showFlash(`error: ${result.error ?? "action failed"}`);
      }
    });
  }

  function runDelete() {
    const count = ids.length;
    if (count === 0) return;
    const ok = window.confirm(
      `Delete ${count} post(s)? This permanently removes them and their threads. This cannot be undone.`,
    );
    if (!ok) return;
    run("Deleted", ids, () => bulkDeleteSessions(ids));
  }

  function runFeature(sessionId: string) {
    startTransition(async () => {
      const result = await toggleFeatured(sessionId);
      if (result.ok) {
        showFlash("Featured posts updated.");
        router.refresh();
      } else {
        showFlash(`error: ${result.error ?? "feature update failed"}`);
      }
    });
  }

  function copyReceiptLink(href: string) {
    navigator.clipboard.writeText(new URL(href, window.location.origin).toString()).then(
      () => showFlash("Post link copied."),
      () => showFlash("error: could not copy post link"),
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <CardMetric label="Ready to publish" value={publishReadyCount} />
        <CardMetric label="Needs attention" value={blockedCount} />
        <CardMetric
          label={plan === "pro" ? "Plan" : "Free public slots"}
          value={plan === "pro" ? "Pro" : `${livePublicCount}/${publicReceiptLimit}`}
        />
        <CardMetric label="Social proof" value={engagementCount} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] bg-black/45 p-2 shadow-[var(--trail-shadow-border)]">
        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
          {(["queue", "live", "private", "blocked", "featured", "all"] as const).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-2 uppercase tracking-[0.12em] transition-[background-color,color,transform] active:scale-[0.97] ${
                filter === value
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {FILTER_LABEL[value]}
            </button>
          ))}
        </div>
        <div className="px-3 font-mono text-[11px] text-zinc-500">
          {filtered.length} shown · {selected.size} selected
        </div>
      </div>

      {flash && (
        <div className="rounded-2xl bg-[var(--accent)]/5 px-4 py-3 font-mono text-xs text-[var(--accent-text)] shadow-[0_0_0_1px_rgba(167,243,0,0.28)]">
          {flash}
        </div>
      )}

      {hasSelection && (
        <div className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-950/95 px-4 py-3 shadow-[0_0_0_1px_rgba(167,243,0,0.25),0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--accent-text)]">
            {ids.length} selected
            {mutableIds.length !== ids.length ? ` · ${ids.length - mutableIds.length} locked` : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              disabled={!hasMutableSelection || pending}
              onClick={() =>
                run("Published", mutableIds, () => bulkSetVisibility(mutableIds, "public"))
              }
              className="min-h-10 rounded-full bg-[var(--accent)] px-3 font-mono font-semibold uppercase tracking-[0.12em] text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent-bright)] active:scale-[0.97] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:active:scale-100"
            >
              Publish
            </button>
            <button
              type="button"
              disabled={!hasMutableSelection || pending}
              onClick={() =>
                run("Made private", mutableIds, () => bulkSetVisibility(mutableIds, "private"))
              }
              className="min-h-10 rounded-full bg-zinc-950 px-3 font-mono uppercase tracking-[0.12em] text-zinc-300 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
            >
              Make private
            </button>
            <button
              type="button"
              disabled={!hasMutableSelection || pending}
              onClick={() =>
                run("Marked shipped", mutableIds, () => bulkSetOutcome(mutableIds, "shipped"))
              }
              className="min-h-10 rounded-full bg-zinc-950 px-3 font-mono uppercase tracking-[0.12em] text-zinc-300 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
            >
              Mark shipped
            </button>
            <button
              type="button"
              disabled={!hasMutableSelection || pending}
              onClick={() =>
                run("Cleared outcome", mutableIds, () => bulkSetOutcome(mutableIds, null))
              }
              className="min-h-10 rounded-full bg-zinc-950 px-3 font-mono uppercase tracking-[0.12em] text-zinc-500 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-zinc-200 hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
            >
              Clear outcome
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={runDelete}
              className="min-h-10 rounded-full bg-rose-500/5 px-3 font-mono uppercase tracking-[0.12em] text-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.35)] transition-[background-color,box-shadow,transform] hover:bg-rose-500/10 hover:shadow-[0_0_0_1px_rgba(244,63,94,0.55)] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
              title="Permanently delete the selected posts"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-white/10 bg-zinc-950/65 p-10 text-center font-mono text-sm text-zinc-500">
          no posts match this view
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map(({ row, lifecycle }) => (
            <StudioCard
              key={row.id}
              session={row}
              lifecycle={lifecycle}
              handle={handle}
              selected={selected.has(row.id)}
              pending={pending}
              onToggle={() => toggle(row.id)}
              onPublish={() =>
                run("Published", [row.id], () => bulkSetVisibility([row.id], "public"))
              }
              onMakePrivate={() =>
                run("Made private", [row.id], () => bulkSetVisibility([row.id], "private"))
              }
              onFeature={() => runFeature(row.id)}
              onCopyLink={() => copyReceiptLink(`/u/${handle}/${row.slug}`)}
            />
          ))}
        </div>
      )}

      <details className="rounded-[1.5rem] bg-black/35 shadow-[var(--trail-shadow-border)]">
        <summary className="cursor-pointer px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500 hover:text-zinc-300">
          Advanced batch table
        </summary>
        <div className="overflow-hidden border-t border-zinc-900">
          <div className="grid grid-cols-[32px_1fr_120px_110px_90px_70px] gap-4 border-b border-zinc-900 bg-zinc-950 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-[var(--accent)]"
              aria-label="Select all visible posts"
            />
            <div>Title</div>
            <div>Tool</div>
            <div>Status</div>
            <div>Visibility</div>
            <div className="text-right">Events</div>
          </div>

          {filtered.map(({ row, lifecycle }) => {
            const isOn = selected.has(row.id);
            return (
              <div
                key={row.id}
                className={`grid grid-cols-[32px_1fr_120px_110px_90px_70px] gap-4 border-b border-zinc-900 px-4 py-3 text-sm last:border-b-0 hover:bg-zinc-950 ${
                  isOn ? "bg-zinc-900/55" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(row.id)}
                  className="mt-0.5 accent-[var(--accent)]"
                  aria-label={`Select ${row.title ?? row.slug}`}
                />
                <div className="min-w-0">
                  <Link
                    href={`/u/${handle}/${row.slug}`}
                    className="block truncate text-zinc-100 hover:text-[var(--accent-text)]"
                    title={row.title ?? row.slug}
                  >
                    {row.title ?? row.slug}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-zinc-600">
                    <span>{row.slug}</span>
                    <span>·</span>
                    <span>{fmtDate(row.startedAt)}</span>
                  </div>
                </div>
                <div className="self-center truncate font-mono text-[11px] text-zinc-400">
                  {row.tool ?? "—"}
                </div>
                <div className="self-center">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${statusTone(
                      lifecycle.tone,
                    )}`}
                  >
                    {lifecycle.label}
                  </span>
                </div>
                <div className="self-center">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${visTone(
                      row.visibility,
                      row.sharedAt,
                    )}`}
                  >
                    {row.visibility === "public" && row.sharedAt === null
                      ? "Staged"
                      : (VIS_LABEL[row.visibility] ?? row.visibility)}
                  </span>
                </div>
                <div className="self-center text-right font-mono text-[11px] tabular-nums text-zinc-500">
                  {row.eventCount}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function StudioCard({
  session,
  lifecycle,
  handle,
  selected,
  pending,
  onToggle,
  onPublish,
  onMakePrivate,
  onFeature,
  onCopyLink,
}: {
  session: SessionRow;
  lifecycle: Lifecycle;
  handle: string;
  selected: boolean;
  pending: boolean;
  onToggle: () => void;
  onPublish: () => void;
  onMakePrivate: () => void;
  onFeature: () => void;
  onCopyLink: () => void;
}) {
  const locked = session.visibility === "redacted" || session.redactedAt !== null;
  const isManual = session.postKind === "manual_build";
  const receiptHref = `/u/${handle}/${session.slug}`;
  const title = session.title ?? session.slug;
  const description =
    session.receiptTldr ??
    session.receiptOutcome ??
    session.summary ??
    "No public story written yet.";
  const commit = truncateCommit(session.linkedCommitSha);
  const hasOutcome =
    session.receiptStatus === "shipped" ||
    session.outcome === "shipped" ||
    session.receiptOutcome !== null;

  return (
    <article
      className={`group relative overflow-hidden rounded-[2rem] bg-zinc-950/82 p-5 shadow-[var(--trail-shadow-border)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--trail-shadow-border-hover)] ${
        selected ? "ring-1 ring-[var(--accent)]/35" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-500/40 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 accent-[var(--accent)]"
            aria-label={`Select ${title}`}
          />
          <span
            className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${statusTone(
              lifecycle.tone,
            )}`}
          >
            {lifecycle.label}
          </span>
        </label>
        <span
          className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${visTone(
            session.visibility,
            session.sharedAt,
          )}`}
        >
          {session.visibility === "public" && session.sharedAt === null
            ? "Staged"
            : (VIS_LABEL[session.visibility] ?? session.visibility)}
        </span>
      </div>

      <div className="mt-5">
        <Link
          href={receiptHref}
          className="block text-2xl font-semibold tracking-[-0.05em] text-zinc-50 hover:text-[var(--accent-text)]"
        >
          {title}
        </Link>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">{description}</p>
        <p className="mt-3 text-sm text-zinc-500">{lifecycle.detail}</p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {isManual ? (
          <CardMetric label="Type" value="Build post" />
        ) : (
          <CardMetric label="Events" value={session.eventCount} />
        )}
        <CardMetric label="Reactions" value={session.reactionCount} />
        <CardMetric label="Replies" value={session.commentCount} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isManual ? (
          <>
            <ChecklistChip
              label="Reviewed"
              good={(session.pendingReviewReasons?.length ?? 0) === 0}
            />
            <ChecklistChip label="Outcome" good={hasOutcome} />
            <ChecklistChip label="Proof" good={session.linkedRepo !== null || commit !== null} />
            <ChecklistChip label="Shared" good={session.sharedAt !== null} />
          </>
        ) : (
          <>
            <ChecklistChip label="Receipt" good={session.receiptGeneratedAt !== null} />
            <ChecklistChip
              label="Reviewed"
              good={(session.pendingReviewReasons?.length ?? 0) === 0}
            />
            <ChecklistChip label="Finished" good={session.endedAt !== null} />
            <ChecklistChip label="Outcome" good={hasOutcome} />
            <ChecklistChip label="Repo" good={session.linkedRepo !== null || commit !== null} />
            <ChecklistChip label="Shared" good={session.sharedAt !== null} />
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {lifecycle.canPublish ? (
          <button
            type="button"
            disabled={pending || locked}
            onClick={onPublish}
            className="inline-flex min-h-10 items-center rounded-full bg-[var(--accent)] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent-bright)] active:scale-[0.97] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:active:scale-100"
          >
            Publish
          </button>
        ) : (
          <Link
            href={receiptHref}
            className="inline-flex min-h-10 items-center rounded-full bg-zinc-100 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.97]"
          >
            {lifecycle.key === "live" ? "Open thread" : "Review post"}
          </Link>
        )}
        {lifecycle.key === "live" && (
          <button
            type="button"
            disabled={pending || locked}
            onClick={onMakePrivate}
            className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-zinc-100 hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
          >
            Unpublish
          </button>
        )}
        {session.sharedAt !== null && (
          <button
            type="button"
            disabled={pending || locked}
            onClick={onFeature}
            className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-zinc-100 hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
          >
            {session.isFeatured ? "Unpin" : "Pin proof"}
          </button>
        )}
        {lifecycle.key === "live" && (
          <>
            <button
              type="button"
              onClick={onCopyLink}
              className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-zinc-100 hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => {
                const url = new URL(receiptHref, window.location.origin).toString();
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                    `I shipped this with AI agents: ${title}`,
                  )}&url=${encodeURIComponent(url)}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
              className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-zinc-100 hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
            >
              Share on X
            </button>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-900 pt-4 font-mono text-[11px] text-zinc-600">
        <span>{session.tool ?? "unknown tool"}</span>
        <span>·</span>
        <span>{fmtDate(session.startedAt)}</span>
        {session.linkedRepo && (
          <>
            <span>·</span>
            <span className="truncate text-zinc-500">
              {session.linkedRepo}
              {commit ? `@${commit}` : ""}
            </span>
          </>
        )}
      </div>
    </article>
  );
}
