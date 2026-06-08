"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface Props {
  slug: string;
  authorHandle?: string | null;
  initialCounts?: Partial<Record<ReactionKind, number>>;
  initialMine?: ReactionKind[];
  variant?: "full" | "inline";
  summary?: string;
  className?: string;
}

export type ReactionKind = "worked" | "needs-tweak" | "broken";

const KINDS: {
  kind: ReactionKind;
  label: string;
  shortLabel: string;
  emoji: string;
  hint: string;
}[] = [
  {
    kind: "worked",
    label: "Worked for me",
    shortLabel: "Worked",
    emoji: "✓",
    hint: "I tried this and it worked",
  },
  {
    kind: "needs-tweak",
    label: "Needed tweaks",
    shortLabel: "Tweaks",
    emoji: "~",
    hint: "Mostly worked, had to adapt",
  },
  {
    kind: "broken",
    label: "Didn't work",
    shortLabel: "Broken",
    emoji: "✕",
    hint: "Couldn't get this to run",
  },
];

function isReactionKind(kind: string): kind is ReactionKind {
  return kind === "worked" || kind === "needs-tweak" || kind === "broken";
}

function normalizeCounts(counts?: Partial<Record<ReactionKind, number>>) {
  return {
    worked: counts?.worked ?? 0,
    "needs-tweak": counts?.["needs-tweak"] ?? 0,
    broken: counts?.broken ?? 0,
  } satisfies Record<ReactionKind, number>;
}

export function ReactionBar({
  slug,
  authorHandle,
  initialCounts,
  initialMine,
  variant = "full",
  summary,
  className,
}: Props) {
  const [counts, setCounts] = useState<Record<ReactionKind, number>>(() =>
    normalizeCounts(initialCounts),
  );
  const [mine, setMine] = useState<ReactionKind[]>(() => initialMine ?? []);
  const [pendingKind, setPendingKind] = useState<ReactionKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reactionsUrl = `/api/sessions/${encodeURIComponent(slug)}/reactions${
    authorHandle ? `?user=${encodeURIComponent(authorHandle)}` : ""
  }`;

  useEffect(() => {
    setCounts(normalizeCounts(initialCounts));
    setMine(initialMine ?? []);
  }, [initialCounts, initialMine]);

  useEffect(() => {
    if (initialCounts && initialMine) return;

    let cancelled = false;
    fetch(reactionsUrl)
      .then((r) => r.json())
      .then((d: { counts?: { kind: string; count: number }[]; mine?: string[] }) => {
        if (cancelled) return;
        const m = normalizeCounts();
        for (const c of d.counts ?? []) {
          if (c.kind === "worked-verified") {
            m.worked += c.count;
          } else if (isReactionKind(c.kind)) {
            m[c.kind] = c.count;
          }
        }
        setCounts(m);
        setMine((d.mine ?? []).filter(isReactionKind));
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load reactions.");
      });
    return () => {
      cancelled = true;
    };
  }, [initialCounts, initialMine, reactionsUrl]);

  async function toggle(kind: ReactionKind) {
    setPendingKind(kind);
    setError(null);
    try {
      const r = await fetch(reactionsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (r.status === 401) {
        const callbackURL = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
        return;
      }
      if (!r.ok) {
        setError("Could not save reaction.");
        return;
      }
      const data = (await r.json()) as { action?: "added" | "removed" };
      if (data.action !== "added" && data.action !== "removed") {
        setError("Could not save reaction.");
        return;
      }
      setMine((prev) =>
        data.action === "added"
          ? [...prev.filter((k) => k !== kind), kind]
          : prev.filter((k) => k !== kind),
      );
      setCounts((prev) => ({
        ...prev,
        [kind]: Math.max(0, (prev[kind] ?? 0) + (data.action === "added" ? 1 : -1)),
      }));
    } catch {
      setError("Could not save reaction.");
    } finally {
      setPendingKind(null);
    }
  }

  if (variant === "inline") {
    return (
      <div className={cn("min-w-0", className)}>
        <div className="flex flex-wrap items-center gap-2">
          {summary ? (
            <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
              {summary}
            </span>
          ) : null}
          {KINDS.map((k) => {
            const isMine = mine.includes(k.kind);
            const n = counts[k.kind] ?? 0;
            return (
              <button
                key={k.kind}
                type="button"
                disabled={pendingKind !== null}
                onClick={() => toggle(k.kind)}
                title={k.hint}
                aria-pressed={isMine}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-[border-color,background-color,color,opacity,transform] active:scale-[0.96]",
                  isMine
                    ? "border-[var(--accent-border)] bg-[var(--accent)]/10 text-[var(--accent-text)]"
                    : "border-white/10 bg-black text-zinc-500 hover:border-white/20 hover:text-zinc-200",
                  pendingKind !== null && "opacity-60",
                )}
              >
                <span>{k.emoji}</span>
                <span className="hidden sm:inline">{k.shortLabel ?? k.label}</span>
                <span className="tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        {error ? <p className="mt-2 text-[11px] text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/20 p-4", className)}>
      <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
        Did this help your build?
      </div>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => {
          const isMine = mine.includes(k.kind);
          const n = counts[k.kind] ?? 0;
          return (
            <button
              key={k.kind}
              type="button"
              disabled={pendingKind !== null}
              onClick={() => toggle(k.kind)}
              title={k.hint}
              aria-pressed={isMine}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                isMine
                  ? "bg-[var(--accent)]/10 border-[var(--accent-border)] text-[var(--accent-text)]"
                  : "border-white/10 text-zinc-300 hover:border-white/25 hover:text-zinc-100"
              }`}
            >
              <span className="font-mono">{k.emoji}</span>
              <span>{k.label}</span>
              {n > 0 && <span className="font-mono text-xs opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
