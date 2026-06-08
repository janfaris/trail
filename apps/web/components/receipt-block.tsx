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
  actions?: ReactNode;
};

function Badge({ status }: { status: ShippedStatus }) {
  const s = (status ?? "unverified") as string;
  let label = "Unverified";
  let cls = "text-zinc-400";
  if (s === "shipped") {
    label = "Shipped";
    cls = "text-[var(--accent-text)]";
  } else if (s === "draft") {
    label = "Draft";
    cls = "text-amber-200";
  }
  return <span className={`font-mono text-[11px] ${cls}`}>{label}</span>;
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
  actions,
}: ReceiptBlockProps) {
  if (!generatedAt) {
    return (
      <section
        className="border-b border-white/[0.08] px-4 py-5 sm:px-5"
        aria-label="Work receipt pending"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12px] text-zinc-600">Work receipt</span>
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
    <section className="border-b border-white/[0.08] px-4 py-5 sm:px-5" aria-label="Work receipt">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] text-zinc-600">Work receipt</span>
          <Badge status={shippedStatus} />
        </div>
        <div className="flex items-center gap-3">
          {linkedRepo && linkedCommitSha && (
            <a
              href={`https://github.com/${linkedRepo}/commit/${linkedCommitSha}`}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-[11px] text-zinc-600 transition-colors hover:text-[var(--accent-text)]"
            >
              {linkedRepo}@{linkedCommitSha.slice(0, 7)}
            </a>
          )}
          {actions}
        </div>
      </div>

      {outcome && (
        <p className="mb-2 text-[15px] font-medium leading-snug text-zinc-100">{outcome}</p>
      )}

      {tldr && (
        <p className="mb-4 whitespace-pre-line text-[14px] leading-6 text-zinc-400">{tldr}</p>
      )}

      {decisions.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-[12px] text-zinc-600">Key decisions</div>
          <ul className="space-y-1.5">
            {decisions.map((d) => (
              <li key={d} className="flex gap-2 text-[13px] leading-5 text-zinc-400">
                <span className="mt-[2px] text-zinc-700" aria-hidden>
                  -
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visibleFiles.length > 0 && (
        <div className="mb-2">
          <div className="mb-2 text-[12px] text-zinc-600">Changed files</div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {visibleFiles.map((f) => (
              <li key={f} className="font-mono text-[11px] text-zinc-500">
                {f}
              </li>
            ))}
            {extraFiles > 0 && (
              <li className="font-mono text-[11px] text-zinc-600">+{extraFiles} more</li>
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
