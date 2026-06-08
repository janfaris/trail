import type { VerifiedBuilderStatus } from "@/lib/verified-builder";

function CheckSeal({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1l1.6 1.2 2-.2.6 1.9 1.7 1.1-.7 1.9.7 1.9-1.7 1.1-.6 1.9-2-.2L8 15l-1.6-1.2-2 .2-.6-1.9L2.1 11l.7-1.9L2.1 7.2l1.7-1.1.6-1.9 2 .2L8 1z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M5.4 8.2l1.8 1.8 3.4-3.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Public proof-of-work credential. Renders nothing unless the builder is
 * verified, so it can be dropped inline next to a handle without layout cost.
 */
export function VerifiedBadge({
  status,
  size = "md",
}: {
  status: VerifiedBuilderStatus;
  size?: "sm" | "md";
}) {
  if (!status.verified) return null;

  const n = status.verifiedShippedCount;
  const title = `Verified Builder — ${n} shipped ${
    n === 1 ? "session" : "sessions"
  } backed by a real commit`;
  const compact = size === "sm";

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--accent-border)]/40 bg-[var(--accent)]/10 font-medium text-[var(--accent-text)] ${
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      <CheckSeal size={compact ? 12 : 14} />
      Verified Builder
    </span>
  );
}
