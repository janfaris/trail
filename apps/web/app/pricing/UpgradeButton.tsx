"use client";

import { useState } from "react";

export function UpgradeButton({ label = "Start 14-day trial" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      if (res.status === 401) {
        window.location.href = "/dashboard"; // login flow lives there
        return;
      }
      const data = (await res.json()) as { sessionUrl?: string; error?: string };
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
        return;
      }
      setErr(data.error || "Could not start checkout.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={loading}
        className="inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium w-full bg-[#a7f300] text-zinc-950 hover:bg-[#b9ff1f] transition-colors disabled:opacity-60"
      >
        {loading ? "Starting checkout…" : label}
      </button>
      {err && <p className="mt-2 text-xs text-red-400 font-mono">{err}</p>}
    </div>
  );
}
