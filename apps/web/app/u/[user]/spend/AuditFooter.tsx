"use client";

// AuditFooter — the only client component on /u/[user]/spend. Owns the
// "Run AI Audit" button + the rendered findings cards. Server passes the
// gating flags + any same-day cached audit; this component decides which
// branch to render and POSTs to /api/spend/audit on click.

import Link from "next/link";
import { useState } from "react";
import type { AuditResult } from "@/lib/spend/audit";
import type { WindowDays } from "@/lib/spend/queries";

type Props = {
  userPlan: string;
  optedIn: boolean;
  windowDays: WindowDays;
  existingAudit: AuditResult | null;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; result: AuditResult };

function severityClasses(s: "low" | "medium" | "high"): string {
  if (s === "high") return "bg-red-500/15 text-red-300 border-red-500/30";
  if (s === "medium") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-zinc-700/30 text-zinc-300 border-zinc-700";
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "$—";
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function mapErrorMessage(err: string | undefined): string {
  switch (err) {
    case "pro_required":
      return "Pro plan required.";
    case "opt_in_required":
      return "Enable AI Spend Audit in /settings first.";
    case "monthly_cap_exceeded":
      return "Monthly cap of 10 audits reached. Try again next month.";
    case "no_data":
      return "No costed sessions in this window yet.";
    case "no_llm_configured":
      return "AI provider is not configured on the server.";
    case "anonymize_failed":
      return "Bundle contained unknown high-entropy tokens. Audit blocked for safety.";
    case "invalid_llm_response":
      return "The model returned an invalid response. Try again.";
    default:
      return err ?? "Something went wrong.";
  }
}

export function AuditFooter({ userPlan, optedIn, windowDays, existingAudit }: Props) {
  const initial: State = existingAudit
    ? { kind: "loaded", result: existingAudit }
    : { kind: "idle" };
  const [state, setState] = useState<State>(initial);

  async function run() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/spend/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowDays }),
      });
      const json = (await res.json()) as { ok?: boolean; result?: AuditResult; error?: string };
      if (!res.ok || !json.ok || !json.result) {
        setState({ kind: "error", message: mapErrorMessage(json.error) });
        return;
      }
      const r = json.result;
      setState({
        kind: "loaded",
        result: { ...r, generatedAt: new Date(r.generatedAt) },
      });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }

  // Non-pro / not-opted-in branches.
  if (userPlan !== "pro") {
    return (
      <ShellFooter
        title="Run AI Audit"
        blurb="Feed your top expensive prompts into a single model call and get concrete, prompt-aware recommendations with estimated $-saved."
      >
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-500 cursor-not-allowed select-none"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-700" />
          Coming soon to Pro
        </button>
        <Link href="/pricing" className="text-xs font-mono text-zinc-500 hover:text-[#a7f300] transition-colors">
          Upgrade →
        </Link>
      </ShellFooter>
    );
  }
  if (!optedIn) {
    return (
      <ShellFooter
        title="Run AI Audit"
        blurb="Opt in to allow your prompts (after redaction) to be analyzed by a single model call. Your call."
      >
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#a7f300]/40 bg-[#a7f300]/10 text-xs font-mono text-[#a7f300] hover:bg-[#a7f300]/15 transition-colors"
        >
          Enable in /settings →
        </Link>
      </ShellFooter>
    );
  }

  // Pro + opted in.
  if (state.kind === "idle") {
    return (
      <ShellFooter
        title="Run AI Audit"
        blurb="One model call over your top expensive sessions in this window. Returns concrete $-saving findings."
      >
        <button
          type="button"
          onClick={run}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#a7f300]/40 bg-[#a7f300]/10 text-xs font-mono text-[#a7f300] hover:bg-[#a7f300]/15 transition-colors"
        >
          Run AI Audit
        </button>
      </ShellFooter>
    );
  }

  if (state.kind === "loading") {
    return (
      <footer className="mt-10 border border-dashed border-zinc-800 rounded-lg p-6">
        <div className="text-sm text-zinc-300 font-mono animate-pulse">Running…</div>
        <div className="text-[12px] text-zinc-500 mt-1">Assembling bundle, scrubbing, calling model. ~20s.</div>
      </footer>
    );
  }
  if (state.kind === "error") {
    return (
      <footer className="mt-10 border border-red-900/40 bg-red-950/20 rounded-lg p-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm text-red-300 font-medium">Audit failed</div>
          <p className="text-[13px] text-red-300/80 mt-1 max-w-md">{state.message}</p>
        </div>
        <button type="button" onClick={run} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-xs font-mono text-zinc-300 hover:bg-zinc-800 transition-colors">
          Retry
        </button>
      </footer>
    );
  }

  const r = state.result;
  return (
    <footer className="mt-10 border border-zinc-900 rounded-lg p-6 bg-zinc-950">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">AI Audit</div>
          <div className="text-3xl font-semibold tracking-tight text-[#a7f300] tabular-nums">
            {fmtUsd(r.totalPotentialSavingsUsd)}/mo
          </div>
          <div className="text-[12px] text-zinc-500 mt-1">Potential savings if every finding below is applied.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] font-mono text-zinc-600">
            Last run: {fmtDate(r.generatedAt)}{r.cached ? " · cached" : ""}
          </div>
          <button type="button" onClick={run} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-800 bg-zinc-900 text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 transition-colors">
            Run again
          </button>
        </div>
      </div>
      <ul className="space-y-3">
        {r.findings.map((f, i) => (
          <li key={i} className="border border-zinc-900 rounded-md p-4 bg-zinc-950 flex flex-col sm:flex-row gap-3 sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-[0.14em] border ${severityClasses(f.severity)}`}>
                  {f.severity}
                </span>
                <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{f.title}</h3>
              </div>
              <p className="text-[13px] text-zinc-400 leading-relaxed">{f.recommendation}</p>
            </div>
            <div className="sm:text-right font-mono tabular-nums text-[#a7f300] text-sm shrink-0">
              {fmtUsd(f.estimatedMonthlySavingsUsd)}/mo
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 text-[11px] font-mono text-zinc-600">
        This audit cost you {fmtUsd(r.auditCostUsd)} to run · model {r.model}
      </div>
    </footer>
  );
}

function ShellFooter({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <footer className="mt-10 border border-dashed border-zinc-800 rounded-lg p-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm text-zinc-200 font-medium">{title}</div>
        <p className="text-[13px] text-zinc-500 mt-1 max-w-md">{blurb}</p>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </footer>
  );
}
