import type { ReactNode } from "react";

type ShippedStatus = "shipped" | "draft" | "unverified" | string | null | undefined;

type ReceiptBlockProps = {
  outcome: string | null | undefined;
  tldr: string | null | undefined;
  keyDecisions: string[] | null | undefined;
  changedFiles: string[] | null | undefined;
  verification:
    | { shipped: boolean; sha: string | null; repo: string | null; checkedAt: string }
    | null
    | undefined;
  generatedAt: Date | string | null | undefined;
  shippedStatus: ShippedStatus;
  linkedRepo: string | null | undefined;
  linkedCommitSha: string | null | undefined;
  validatorWarnings: string[] | null | undefined;
};

function Badge({ status }: { status: ShippedStatus }) {
  const s = (status ?? "unverified") as string;
  let label = "Unverified";
  let icon: ReactNode = "⚠";
  let cls = "border-zinc-700 bg-zinc-800/60 text-zinc-400";
  if (s === "shipped") {
    label = "Shipped";
    icon = "✓";
    cls = "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  } else if (s === "draft") {
    label = "Draft";
    icon = "◐";
    cls = "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[11px] ${cls}`}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

export function ReceiptBlock({
  outcome,
  tldr,
  keyDecisions,
  changedFiles,
  verification: _verification,
  generatedAt,
  shippedStatus,
  linkedRepo,
  linkedCommitSha,
  validatorWarnings,
}: ReceiptBlockProps) {
  if (!generatedAt) {
    return (
      <section
        className="mb-10 rounded-lg border border-zinc-900 bg-[#0c0d10] p-5"
        aria-label="Work receipt pending"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Work receipt
          </span>
          <Badge status="unverified" />
        </div>
        <p className="text-sm text-zinc-400">
          Receipt pending — this session hasn&apos;t been summarized yet.
        </p>
      </section>
    );
  }

  const files = changedFiles ?? [];
  const visibleFiles = files.slice(0, 5);
  const extraFiles = Math.max(0, files.length - visibleFiles.length);
  const decisions = (keyDecisions ?? []).filter(Boolean);
  const redactionCount = (validatorWarnings ?? []).length;

  return (
    <section
      className="mb-10 rounded-lg border border-[#1c1d22] bg-[#0c0d10] p-5"
      aria-label="Work receipt"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Work receipt
          </span>
          <Badge status={shippedStatus} />
        </div>
        {linkedRepo && linkedCommitSha && (
          <a
            href={`https://github.com/${linkedRepo}/commit/${linkedCommitSha}`}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-[11px] text-[#8a8fdc] hover:text-[#a5aaeb] transition-colors"
          >
            {linkedRepo}@{linkedCommitSha.slice(0, 7)}
          </a>
        )}
      </div>

      {outcome && (
        <p className="text-[15px] leading-snug text-zinc-100 font-medium mb-2">
          {outcome}
        </p>
      )}

      {tldr && (
        <p className="text-sm text-zinc-400 leading-relaxed mb-4 whitespace-pre-line">
          {tldr}
        </p>
      )}

      {decisions.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Key decisions
          </div>
          <ul className="space-y-1.5">
            {decisions.map((d, i) => (
              <li key={i} className="text-sm text-zinc-300 leading-snug flex gap-2">
                <span className="text-[#5e6ad2] mt-[2px]" aria-hidden>
                  →
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visibleFiles.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Changed files
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {visibleFiles.map((f) => (
              <li
                key={f}
                className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/60 text-zinc-300"
              >
                {f}
              </li>
            ))}
            {extraFiles > 0 && (
              <li className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/30 text-zinc-500">
                +{extraFiles} more
              </li>
            )}
          </ul>
        </div>
      )}

      {redactionCount > 0 && (
        <div className="mt-3 text-[11px] font-mono text-zinc-500">
          {redactionCount} validator note{redactionCount === 1 ? "" : "s"}
        </div>
      )}
    </section>
  );
}
