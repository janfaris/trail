// Track B — compact "This session" cost block injected into the session
// detail page. Sums every attribution row for the session (a session can
// have both a native row and one or more vendor fanout rows) and derives a
// combined source label.

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

type Props = {
  sessionId: string;
  userId: string;
  estimatedCostUsd: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
};

function parseUsd(raw: string | null | undefined): number {
  if (raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "0";
  return n.toLocaleString("en-US");
}

export async function SessionCostBlock({
  sessionId,
  userId,
  estimatedCostUsd,
  inputTokens,
  outputTokens,
  cachedTokens,
}: Props) {
  // Tenant-scoped: sessionId is globally unique but guard userId anyway.
  const attribRows = await db
    .select({
      source: schema.sessionCostAttribution.source,
      attributedCostUsd: schema.sessionCostAttribution.attributedCostUsd,
    })
    .from(schema.sessionCostAttribution)
    .where(
      and(
        eq(schema.sessionCostAttribution.sessionId, sessionId),
        eq(schema.sessionCostAttribution.userId, userId),
      ),
    );

  // Prefer the summed attribution total — it's the canonical per-PR cost
  // basis. Fall back to the session's own estimatedCostUsd when no
  // attribution row exists yet (cron hasn't run, native-only session etc.).
  const attribTotal = attribRows.reduce(
    (n, r) => n + parseUsd(r.attributedCostUsd),
    0,
  );
  const sessionEstimate = parseUsd(estimatedCostUsd);
  const cost = attribTotal > 0 ? attribTotal : sessionEstimate;

  if (cost <= 0) {
    return (
      <aside className="mb-8 border border-zinc-900 rounded-lg px-4 py-3 flex items-center gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-0.5">
            This session
          </div>
          <div className="text-sm font-mono text-zinc-500">
            Cost not available{" "}
            <span
              title="This agent doesn't expose tokens, or no vendor connection is wired."
              className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-zinc-800 text-zinc-500 text-[10px] cursor-help align-middle"
              aria-label="why?"
            >
              ?
            </span>
          </div>
        </div>
      </aside>
    );
  }

  const hasNative = attribRows.some((r) => r.source === "native");
  const hasFanout = attribRows.some((r) =>
    typeof r.source === "string" && r.source.startsWith("fanout_"),
  );

  let basisLabel: string | null = null;
  if (hasNative && hasFanout) basisLabel = "native + vendor-fanout";
  else if (hasNative) basisLabel = "native";
  else if (hasFanout) basisLabel = "vendor-fanout";

  const inT = inputTokens ?? 0;
  const outT = outputTokens ?? 0;
  const cachedT = cachedTokens ?? 0;
  const hasTokens = inT > 0 || outT > 0;

  return (
    <aside className="mb-8 border border-zinc-900 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-0.5">
            This session
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums text-[#a7f300]">
              {fmtUsd(cost)}
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              estimated
            </span>
            {basisLabel && (
              <span
                title={`Cost basis: ${basisLabel}`}
                className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400"
              >
                {basisLabel}
              </span>
            )}
          </div>
        </div>

        {hasTokens && (
          <div className="ml-auto text-right">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-0.5">
              Tokens
            </div>
            <div className="text-xs font-mono tabular-nums text-zinc-300">
              {fmtTokens(inT)} in
              <span className="text-zinc-700"> · </span>
              {fmtTokens(outT)} out
              {cachedT > 0 && (
                <>
                  <span className="text-zinc-700"> · </span>
                  <span className="text-zinc-500">{fmtTokens(cachedT)} cached</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
