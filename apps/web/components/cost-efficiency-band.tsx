// Track B — cost-per-PR pivot. Self-only "Cost Efficiency" band that sits
// above the existing tools/sessions/recaps surface on /u/[user]. We reuse
// aggregateCost() (cost-monthly tier, 30-day window) and the connection list
// to drive a 4-stat row. Non-self viewers never see this band — vendor /
// spend data is private.

import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { aggregateCost } from "@/lib/recap/cost-aggregate";

const VENDOR_SLOTS = ["anthropic", "openai", "cursor", "copilot"] as const;
type VendorSlot = (typeof VENDOR_SLOTS)[number];

const VENDOR_LABEL: Record<VendorSlot, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  cursor: "Cursor",
  copilot: "Copilot",
};

// "Active" excludes auth_error — a broken key shouldn't fill a logo slot.
// Pending / rate_limited still count: the connection exists and may recover.
const ACTIVE_STATUSES = ["ok", "pending", "rate_limited"] as const;

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function VendorGlyph({ id }: { id: VendorSlot }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (id) {
    case "anthropic":
      return (
        <svg {...common}>
          <path d="M5 13L8 3l3 10" />
          <path d="M6 10h4" />
        </svg>
      );
    case "cursor":
      return (
        <svg {...common}>
          <path d="M3 2.5l9.5 5.5L8 9l-1 4.5z" />
        </svg>
      );
    case "openai":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 2.5v11M2.5 8h11M4 4l8 8M12 4l-8 8" opacity="0.5" />
        </svg>
      );
    case "copilot":
      return (
        <svg {...common}>
          <rect x="2" y="6" width="12" height="6" rx="3" />
          <circle cx="6" cy="9" r="1" fill="currentColor" stroke="none" />
          <circle cx="10" cy="9" r="1" fill="currentColor" stroke="none" />
          <path d="M5 6V5a3 3 0 0 1 6 0v1" />
        </svg>
      );
  }
}

export async function CostEfficiencyBand({ userId }: { userId: string }) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [payload, activeConnections] = await Promise.all([
    aggregateCost({
      userId,
      windowStart,
      windowEnd: now,
      tier: "cost-monthly",
    }),
    db
      .select({
        vendor: schema.vendorConnection.vendor,
        syncStatus: schema.vendorConnection.syncStatus,
      })
      .from(schema.vendorConnection)
      .where(
        and(
          eq(schema.vendorConnection.userId, userId),
          inArray(
            schema.vendorConnection.syncStatus,
            ACTIVE_STATUSES as unknown as string[],
          ),
        ),
      ),
  ]);

  const m = payload.metrics;
  const hasCostData = m.shippedPrCount > 0 && m.totalCostUsd > 0;
  const hasAnyConnection = activeConnections.length > 0;

  // Empty state: no shipped+attributed PRs yet. Surface the wedge — connect
  // a vendor — instead of an empty stat row.
  if (!hasCostData) {
    return (
      <section className="mb-8 border border-zinc-800 rounded-lg bg-zinc-900/40 px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">
              Cost efficiency
            </div>
            <p className="text-sm text-zinc-300 max-w-xl">
              {hasAnyConnection
                ? "Sync is running. Cost-per-PR will fill in once your next shipped PR is attributed."
                : "Connect a vendor to start tracking what your shipped PRs actually cost."}
            </p>
          </div>
          <Link
            href="/settings/connections"
            className="inline-flex items-center justify-center rounded-md bg-[#a7f300] hover:bg-[#b9ff1f] text-zinc-950 text-xs font-mono font-semibold h-8 px-3 transition-colors"
          >
            {hasAnyConnection ? "Manage connections →" : "Connect a vendor →"}
          </Link>
        </div>
      </section>
    );
  }

  const costPerPr = m.avgCostPerPrUsd;
  const topModel = m.topModelByCost;

  // Connection vendor → keyed by slot. We dedupe defensively; the unique
  // index on (userId, vendor) means at most one row per vendor anyway.
  const connectedByVendor = new Map<string, string>();
  for (const c of activeConnections) {
    connectedByVendor.set(c.vendor, c.syncStatus);
  }

  return (
    <section className="mb-8 border-t border-zinc-900 pt-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
          Cost efficiency
        </h3>
        <Link
          href="/dashboard/cost"
          className="text-[11px] font-mono text-zinc-500 hover:text-[#a7f300] transition-colors"
        >
          Full cost breakdown →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* $/PR */}
        <div className="border border-zinc-900 rounded-lg px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">
            $/PR · 30d
          </div>
          <div className="text-2xl font-semibold tabular-nums text-[#a7f300]">
            {fmtMoney(costPerPr)}
          </div>
        </div>

        {/* Shipped PRs */}
        <div className="border border-zinc-900 rounded-lg px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">
            Shipped PRs · 30d
          </div>
          <div className="text-2xl font-semibold tabular-nums text-zinc-100">
            {m.shippedPrCount}
          </div>
        </div>

        {/* Top model */}
        <div className="border border-zinc-900 rounded-lg px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">
            Top model
          </div>
          {topModel ? (
            <>
              <div className="text-sm font-mono text-zinc-100 truncate" title={topModel.model}>
                {topModel.model === "unknown" ? "—" : topModel.model}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-500 mt-0.5">
                {fmtMoney(topModel.costUsd)}
              </div>
            </>
          ) : (
            <div className="text-sm font-mono text-zinc-500">—</div>
          )}
        </div>

        {/* Active vendors */}
        <div className="border border-zinc-900 rounded-lg px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">
            Active vendors
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {VENDOR_SLOTS.map((v) => {
              const connected = connectedByVendor.has(v);
              return (
                <span
                  key={v}
                  role="img"
                  aria-label={`${VENDOR_LABEL[v]}: ${connected ? "connected" : "not connected"}`}
                  title={`${VENDOR_LABEL[v]} · ${connected ? "connected" : "not connected"}`}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${
                    connected
                      ? "border-[#a7f300]/40 bg-[#a7f300]/10 text-[#a7f300]"
                      : "border-zinc-900 bg-zinc-950 text-zinc-700"
                  }`}
                >
                  <VendorGlyph id={v} />
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] font-mono text-zinc-600">
        Last 30 days · receipt-verified only
      </div>
    </section>
  );
}

export function CostEfficiencyBandSkeleton() {
  return (
    <section className="mb-8 border-t border-zinc-900 pt-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-3">
        Cost efficiency
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="border border-zinc-900 rounded-lg px-4 py-3 h-[72px] animate-pulse bg-zinc-900/40"
          />
        ))}
      </div>
    </section>
  );
}
