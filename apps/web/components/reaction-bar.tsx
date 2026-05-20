"use client";

import { useEffect, useState } from "react";

interface Props {
  slug: string;
}

const KINDS: { kind: string; label: string; emoji: string; hint: string }[] = [
  { kind: "worked", label: "Worked for me", emoji: "✓", hint: "I tried this and it worked" },
  { kind: "needs-tweak", label: "Needed tweaks", emoji: "~", hint: "Mostly worked, had to adapt" },
  { kind: "broken", label: "Didn't work", emoji: "✕", hint: "Couldn't get this to run" },
];

export function ReactionBar({ slug }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sessions/${slug}/reactions`)
      .then((r) => r.json())
      .then((d: { counts?: { kind: string; count: number }[]; mine?: string[] }) => {
        if (cancelled) return;
        const m: Record<string, number> = {};
        for (const c of d.counts ?? []) m[c.kind] = c.count;
        setCounts(m);
        setMine(d.mine ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function toggle(kind: string) {
    setLoading(true);
    try {
      const r = await fetch(`/api/sessions/${slug}/reactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (r.status === 401) {
        window.location.href = "/api/auth/sign-in/github";
        return;
      }
      const data = (await r.json()) as { action?: "added" | "removed" };
      setMine((prev) =>
        data.action === "added"
          ? [...prev.filter((k) => k !== kind), kind]
          : prev.filter((k) => k !== kind),
      );
      setCounts((prev) => ({
        ...prev,
        [kind]: Math.max(0, (prev[kind] ?? 0) + (data.action === "added" ? 1 : -1)),
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4 mt-6">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-3">
        Did this work for you?
      </div>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => {
          const isMine = mine.includes(k.kind);
          const n = counts[k.kind] ?? 0;
          return (
            <button
              key={k.kind}
              type="button"
              disabled={loading}
              onClick={() => toggle(k.kind)}
              title={k.hint}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                isMine
                  ? "bg-[#a7f300]/10 border-[#a7f300] text-[#a7f300]"
                  : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
              }`}
            >
              <span className="font-mono">{k.emoji}</span>
              <span>{k.label}</span>
              {n > 0 && (
                <span className="font-mono text-xs opacity-70">{n}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
