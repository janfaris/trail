"use client";

// AuditFooter — the only client component on /u/[user]/spend. Owns the
// "Run AI Audit" button + the rendered findings cards. Server passes the
// gating flags + any same-day cached audit; this component decides which
// branch to render and POSTs to /api/spend/audit on click.

import type { AuditResult } from "@/lib/spend/audit";
import type { WindowDays } from "@/lib/spend/queries";
import Link from "next/link";
import { useState } from "react";

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
          className="inline-flex min-h-10 cursor-not-allowed select-none items-center gap-2 rounded-full bg-zinc-900/60 px-4 font-mono text-xs text-zinc-500 shadow-[var(--trail-shadow-border)]"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-700" />
          Coming soon to Pro
        </button>
        <Link
          href="/pricing"
          className="font-mono text-xs text-zinc-500 transition-colors hover:text-[var(--accent-text)]"
        >
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
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--accent)]/10 px-4 font-mono text-xs text-[var(--accent-text)] shadow-[0_0_0_1px_rgba(167,243,0,0.32)] transition-[background-color,transform] hover:bg-[var(--accent)]/15 active:scale-[0.97]"
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
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--accent)]/10 px-4 font-mono text-xs text-[var(--accent-text)] shadow-[0_0_0_1px_rgba(167,243,0,0.32)] transition-[background-color,transform] hover:bg-[var(--accent)]/15 active:scale-[0.97]"
        >
          Run AI Audit
        </button>
      </ShellFooter>
    );
  }

  if (state.kind === "loading") {
    return (
      <footer className="mt-10 rounded-[1.5rem] border border-dashed border-zinc-800/80 p-6">
        <div className="animate-pulse font-mono text-sm text-zinc-300">Running…</div>
        <div className="mt-1 text-[12px] text-zinc-500">
          Assembling bundle, scrubbing, calling model. ~20s.
        </div>
      </footer>
    );
  }
  if (state.kind === "error") {
    return (
      <footer className="mt-10 flex flex-col gap-4 rounded-[1.5rem] bg-red-950/20 p-6 shadow-[0_0_0_1px_rgba(127,29,29,0.55)] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-red-300">Audit failed</div>
          <p className="mt-1 max-w-md text-[13px] text-red-300/80">{state.message}</p>
        </div>
        <button
          type="button"
          onClick={run}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-zinc-950 px-4 font-mono text-xs text-zinc-300 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
        >
          Retry
        </button>
      </footer>
    );
  }

  const r = state.result;
  return (
    <footer className="mt-10 rounded-[1.5rem] bg-zinc-950/70 p-6 shadow-[var(--trail-shadow-border)]">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            AI Audit
          </div>
          <div className="text-3xl font-semibold tracking-tight text-[var(--accent-text)] tabular-nums">
            {fmtUsd(r.totalPotentialSavingsUsd)}/mo
          </div>
          <div className="mt-1 text-[12px] text-zinc-500">
            Potential savings if every finding below is applied.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] font-mono text-zinc-600">
            Last run: {fmtDate(r.generatedAt)}
            {r.cached ? " · cached" : ""}
          </div>
          <button
            type="button"
            onClick={run}
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-zinc-900 px-3 font-mono text-[11px] text-zinc-300 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
          >
            Run again
          </button>
        </div>
      </div>
      <ul className="space-y-3">
        {r.findings.map((f) => (
          <li
            key={`${f.severity}:${f.title}:${f.estimatedMonthlySavingsUsd}`}
            className="flex flex-col gap-3 rounded-2xl bg-black/35 p-4 shadow-[var(--trail-shadow-border)] sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] shadow-[0_0_0_1px_currentColor] ${severityClasses(f.severity)}`}
                >
                  {f.severity}
                </span>
                <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{f.title}</h3>
              </div>
              <p className="text-[13px] text-zinc-400 leading-relaxed">{f.recommendation}</p>
            </div>
            <div className="shrink-0 font-mono text-sm tabular-nums text-[var(--accent-text)] sm:text-right">
              {fmtUsd(f.estimatedMonthlySavingsUsd)}/mo
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 font-mono text-[11px] text-zinc-600">
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
    <footer className="mt-10 flex flex-col gap-4 rounded-[1.5rem] border border-dashed border-zinc-800/80 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-200">{title}</div>
        <p className="mt-1 max-w-md text-[13px] text-zinc-500">{blurb}</p>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </footer>
  );
}
