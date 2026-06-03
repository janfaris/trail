"use client";

import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";

// ────────────────────────────────────────────────────────────────────────────
// Types & vendor catalog
// ────────────────────────────────────────────────────────────────────────────

export type ConnectionRow = {
  id: string;
  vendor: string;
  workspaceId: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
  syncErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type VendorMeta = {
  id: "anthropic" | "openai" | "cursor" | "copilot";
  name: string;
  live: boolean;
  tier: "primary" | "partial";
  keyPlaceholder: string;
  keyHint: string;
  workspacePlaceholder: string;
  description: string;
};

const VENDORS: VendorMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    live: true,
    tier: "primary",
    keyPlaceholder: "sk-ant-admin01-…",
    keyHint:
      "Admin key from console.anthropic.com → Settings → Admin Keys. Starts with sk-ant-admin01-.",
    workspacePlaceholder: "ws_… (optional)",
    description: "Claude API org-wide usage and spend.",
  },
  {
    id: "openai",
    name: "OpenAI",
    live: true,
    tier: "primary",
    keyPlaceholder: "sk-admin-…",
    keyHint: "Admin key from platform.openai.com → Organization → Admin keys.",
    workspacePlaceholder: "org-… (optional)",
    description: "OpenAI org-wide usage and spend.",
  },
  {
    id: "cursor",
    name: "Cursor",
    live: true,
    tier: "partial",
    keyPlaceholder: "Cursor admin key",
    keyHint:
      "Registers your Cursor account so the local CLI uploader can ship usage. No public admin API.",
    workspacePlaceholder: "team-id (optional)",
    description: "Cursor team usage — partial telemetry only.",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    live: true,
    tier: "partial",
    keyPlaceholder: "ghp_… or github_pat_…",
    keyHint:
      "GitHub PAT with admin:org scope + org login. Metrics API gives engagement counts only — no per-user tokens.",
    workspacePlaceholder: "org login (required)",
    description:
      "Copilot Enterprise / Business engagement counts. No per-user dollar attribution available.",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function relativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dys = Math.floor(h / 24);
  return `${dys}d ago`;
}

type StatusKind = "ok" | "pending" | "auth_error" | "rate_limited" | "unknown";

function statusKind(s: string | undefined | null): StatusKind {
  if (s === "ok" || s === "pending" || s === "auth_error" || s === "rate_limited") return s;
  return "unknown";
}

const STATUS_LABEL: Record<StatusKind, string> = {
  ok: "Synced",
  pending: "Pending",
  auth_error: "Auth error",
  rate_limited: "Rate-limited",
  unknown: "Unknown",
};

const STATUS_CLASSES: Record<StatusKind, string> = {
  ok: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  pending: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  auth_error: "text-rose-300 bg-rose-500/10 border-rose-500/30",
  rate_limited: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  unknown: "text-zinc-400 bg-zinc-900 border-zinc-800",
};

function VendorIcon({ id }: { id: VendorMeta["id"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    role: "img",
  };
  switch (id) {
    case "anthropic":
      return (
        <svg {...common}>
          <title>Anthropic</title>
          <path d="M5 13L8 3l3 10" />
          <path d="M6 10h4" />
        </svg>
      );
    case "cursor":
      return (
        <svg {...common}>
          <title>Cursor</title>
          <path d="M3 2.5l9.5 5.5L8 9l-1 4.5z" />
        </svg>
      );
    case "openai":
      return (
        <svg {...common}>
          <title>OpenAI</title>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 2.5v11M2.5 8h11M4 4l8 8M12 4l-8 8" opacity="0.5" />
        </svg>
      );
    case "copilot":
      return (
        <svg {...common}>
          <title>GitHub Copilot</title>
          <rect x="2" y="6" width="12" height="6" rx="3" />
          <circle cx="6" cy="9" r="1" fill="currentColor" stroke="none" />
          <circle cx="10" cy="9" r="1" fill="currentColor" stroke="none" />
          <path d="M5 6V5a3 3 0 0 1 6 0v1" />
        </svg>
      );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main client component
// ────────────────────────────────────────────────────────────────────────────

type CardMessage = { kind: "ok" | "err" | "info"; text: string };

export function ConnectionsClient({
  initialConnections,
}: {
  initialConnections: ConnectionRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [messages, setMessages] = useState<Record<string, CardMessage | undefined>>({});
  const [modalVendor, setModalVendor] = useState<VendorMeta | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const connByVendor = new Map(initialConnections.map((c) => [c.vendor, c]));

  const markBusy = useCallback((vendor: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(vendor);
      else next.delete(vendor);
      return next;
    });
  }, []);

  const setMsg = useCallback((vendor: string, msg: CardMessage | undefined) => {
    setMessages((prev) => ({ ...prev, [vendor]: msg }));
  }, []);

  const openModal = useCallback((vendor: VendorMeta, trigger: HTMLButtonElement | null) => {
    triggerRef.current = trigger;
    setModalVendor(vendor);
  }, []);

  const closeModal = useCallback(() => {
    setModalVendor(null);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  async function handleTest(vendor: VendorMeta) {
    if (busy.has(vendor.id)) return;
    markBusy(vendor.id, true);
    setMsg(vendor.id, undefined);
    try {
      const res = await fetch(`/api/connections/${vendor.id}/test`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rows?: number;
      };
      if (res.ok && data.ok) {
        setMsg(vendor.id, {
          kind: "ok",
          text: `Connected. Found ${data.rows ?? 0} usage row${data.rows === 1 ? "" : "s"}.`,
        });
      } else if (data.error === "not_yet_implemented") {
        setMsg(vendor.id, {
          kind: "info",
          text: "Testing not available yet for this vendor — sync runs once support lands.",
        });
      } else if (data.error === "invalid_api_key") {
        setMsg(vendor.id, {
          kind: "err",
          text: "Invalid API key. Double-check the key and reconnect.",
        });
      } else if (data.error === "rate_limited") {
        setMsg(vendor.id, {
          kind: "err",
          text: "Rate-limited by the vendor. Try again in a few minutes.",
        });
      } else {
        setMsg(vendor.id, {
          kind: "err",
          text: "Test failed. Try again — if it persists, reconnect.",
        });
      }
    } catch {
      setMsg(vendor.id, {
        kind: "err",
        text: "Network error while testing. Try again.",
      });
    } finally {
      markBusy(vendor.id, false);
      router.refresh();
    }
  }

  async function handleDisconnect(vendor: VendorMeta) {
    if (busy.has(vendor.id)) return;
    if (!window.confirm(`Disconnect ${vendor.name}? Future syncs will stop until you reconnect.`)) {
      return;
    }
    markBusy(vendor.id, true);
    setMsg(vendor.id, undefined);
    try {
      const res = await fetch(`/api/connections/${vendor.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMsg(vendor.id, { kind: "ok", text: "Disconnected." });
      } else {
        setMsg(vendor.id, {
          kind: "err",
          text: "Failed to disconnect. Try again.",
        });
      }
    } catch {
      setMsg(vendor.id, {
        kind: "err",
        text: "Network error while disconnecting.",
      });
    } finally {
      markBusy(vendor.id, false);
      router.refresh();
    }
  }

  async function handleConnect(
    vendor: VendorMeta,
    apiKey: string,
    workspaceId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (busy.has(vendor.id)) return { ok: false, error: "Already in progress." };
    markBusy(vendor.id, true);
    try {
      const body: { apiKey: string; workspaceId?: string } = {
        apiKey: apiKey.trim(),
      };
      const ws = workspaceId.trim();
      if (ws) body.workspaceId = ws;

      const res = await fetch(`/api/connections/${vendor.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
      };
      if (res.ok) {
        setMsg(vendor.id, {
          kind: "ok",
          text: vendor.live
            ? "Connected. Run Test to verify the key now."
            : "Saved. Sync will start when this vendor is supported.",
        });
        router.refresh();
        return { ok: true };
      }
      const errText =
        data.error === "invalid_key_format"
          ? data.hint || "Key format looks wrong. Check the expected prefix."
          : data.error === "invalid body"
            ? "Key must be at least 8 characters."
            : data.error || "Failed to save key.";
      return { ok: false, error: errText };
    } catch {
      return { ok: false, error: "Network error. Try again." };
    } finally {
      markBusy(vendor.id, false);
    }
  }

  const [syncing, setSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState<{
    kind: "ok" | "err" | "info";
    text: string;
  } | null>(null);
  const hasConnections = initialConnections.length > 0;

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncBanner(null);
    try {
      const res = await fetch("/api/connections/sync-now", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        runs?: Array<{
          vendor: string;
          status: string;
          rowsInserted: number;
          errorMessage?: string;
        }>;
        message?: string;
        error?: string;
      };
      if (res.status === 429) {
        setSyncBanner({
          kind: "info",
          text: data.message ?? "Sync cooldown active. Try again in a moment.",
        });
      } else if (!res.ok) {
        setSyncBanner({ kind: "err", text: data.error ?? "Sync failed. Check the page console." });
      } else {
        const runs = data.runs ?? [];
        if (runs.length === 0) {
          setSyncBanner({
            kind: "info",
            text: data.message ?? "Nothing to sync yet — add a vendor first.",
          });
        } else {
          const totalRows = runs.reduce((acc, r) => acc + (r.rowsInserted ?? 0), 0);
          const failed = runs.filter((r) => r.status !== "ok").length;
          setSyncBanner({
            kind: failed === 0 ? "ok" : "info",
            text: `Synced ${runs.length} connection${runs.length === 1 ? "" : "s"} · ${totalRows} new usage row${totalRows === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}.`,
          });
        }
        router.refresh();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncBanner({ kind: "err", text: `Sync request failed: ${msg}` });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] bg-zinc-950/70 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          Usage capture
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-zinc-50">
          Connect your data sources
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Trail prices each AI session against current per-token rates and links the cost to the
          merged commit. The default path is local capture; admin-key reconciliation is optional.
        </p>

        <div className="mt-6 max-w-3xl rounded-[1.5rem] bg-[#a7f300]/5 p-5 shadow-[0_0_0_1px_rgba(167,243,0,0.24)]">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
              Recommended · No keys
            </span>
          </div>
          <div className="mb-3 text-base font-medium text-zinc-50">Install the CLI</div>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex min-h-11 flex-1 items-center overflow-x-auto rounded-2xl bg-zinc-950 px-4 font-mono text-[13px] text-zinc-200 shadow-[var(--trail-shadow-border)]">
              <span className="mr-2 select-none text-zinc-600">$</span>
              <span className="break-all">npm install -g @gettrail/cli</span>
            </div>
          </div>
          <div className="text-[13px] leading-relaxed text-zinc-400">
            Trail tails the JSONL logs your AI agents already write to disk -{" "}
            <span className="font-medium text-zinc-200">Claude Code</span> and{" "}
            <span className="font-medium text-zinc-200">Codex</span>. Tokens are captured per turn,
            priced against the model_price table, and attributed to the merge commit when you ship.
          </div>
          <div className="mt-3 font-mono text-[12px] text-zinc-600">
            More setup detail at{" "}
            <a href="/install" className="text-[#a7f300] hover:underline">
              /install →
            </a>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="mb-0.5 text-base font-semibold text-zinc-50">
            Optional · cross-vendor reconciliation
          </h2>
          <p className="max-w-xl text-[13px] text-zinc-500">
            Connect admin keys to match Trail&apos;s numbers against your vendor invoices exactly.
            Skippable.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSyncNow}
          disabled={syncing || !hasConnections}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-zinc-100 px-4 text-[13px] font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {syncing ? "Syncing…" : "Run sync now"}
        </button>
      </div>

      {syncBanner && (
        <output
          aria-live="polite"
          className={cn(
            "rounded-2xl px-4 py-3 text-[13px] shadow-[var(--trail-shadow-border)]",
            syncBanner.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : syncBanner.kind === "err"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-sky-500/30 bg-sky-500/10 text-sky-200",
          )}
        >
          {syncBanner.text}
        </output>
      )}

      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        Primary — full token capture
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {VENDORS.filter((v) => v.tier === "primary").map((v) => {
          const conn = connByVendor.get(v.id);
          const isBusy = busy.has(v.id);
          const msg = messages[v.id];
          return (
            <VendorCard
              key={v.id}
              vendor={v}
              connection={conn}
              busy={isBusy}
              message={msg}
              onConnect={(trigger) => openModal(v, trigger)}
              onTest={() => handleTest(v)}
              onDisconnect={() => handleDisconnect(v)}
            />
          );
        })}
      </div>

      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        Partial — limited telemetry
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {VENDORS.filter((v) => v.tier === "partial").map((v) => {
          const conn = connByVendor.get(v.id);
          const isBusy = busy.has(v.id);
          const msg = messages[v.id];
          return (
            <VendorCard
              key={v.id}
              vendor={v}
              connection={conn}
              busy={isBusy}
              message={msg}
              onConnect={(trigger) => openModal(v, trigger)}
              onTest={() => handleTest(v)}
              onDisconnect={() => handleDisconnect(v)}
            />
          );
        })}
      </div>

      {modalVendor && (
        <ConnectModal
          vendor={modalVendor}
          busy={busy.has(modalVendor.id)}
          onClose={closeModal}
          onSubmit={async (apiKey, workspaceId) => {
            const result = await handleConnect(modalVendor, apiKey, workspaceId);
            if (result.ok) closeModal();
            return result;
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Card
// ────────────────────────────────────────────────────────────────────────────

function VendorCard({
  vendor,
  connection,
  busy,
  message,
  onConnect,
  onTest,
  onDisconnect,
}: {
  vendor: VendorMeta;
  connection: ConnectionRow | undefined;
  busy: boolean;
  message: CardMessage | undefined;
  onConnect: (trigger: HTMLButtonElement | null) => void;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  const kind = connection ? statusKind(connection.syncStatus) : "unknown";

  return (
    <div className="flex flex-col gap-4 rounded-[1.5rem] bg-zinc-950/70 p-5 shadow-[var(--trail-shadow-border)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--trail-shadow-border-hover)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-zinc-300 shadow-[var(--trail-shadow-border)]">
            <VendorIcon id={vendor.id} />
          </span>
          <div>
            <div className="text-sm font-semibold text-zinc-100">{vendor.name}</div>
            <div className="text-xs text-zinc-500">{vendor.description}</div>
          </div>
        </div>
        {!vendor.live && (
          <span className="rounded-full bg-amber-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300/90 shadow-[0_0_0_1px_rgba(245,158,11,0.28)]">
            Soon
          </span>
        )}
      </div>

      {connection ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono",
                STATUS_CLASSES[kind],
              )}
            >
              {STATUS_LABEL[kind]}
            </span>
            <span className="font-mono text-xs text-zinc-500">
              Last sync: {relativeTime(connection.lastSyncedAt)}
            </span>
          </div>
          {connection.workspaceId && (
            <div className="text-xs text-zinc-500">
              Workspace: <span className="font-mono text-zinc-400">{connection.workspaceId}</span>
            </div>
          )}
          {connection.syncErrorMessage && (
            <div className="break-words font-mono text-xs text-rose-300/90">
              {connection.syncErrorMessage}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onTest}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-black px-3 font-mono text-xs text-zinc-100 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? "Testing…" : "Test"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDisconnect}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-rose-500/5 px-3 font-mono text-xs text-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.3)] transition-[background-color,box-shadow,transform] hover:bg-rose-500/10 hover:shadow-[0_0_0_1px_rgba(244,63,94,0.5)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => onConnect(e.currentTarget)}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#a7f300] px-4 font-mono text-xs font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-[#b9ff1f] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            Connect
          </button>
          <span className="text-xs text-zinc-500">Not connected</span>
        </div>
      )}

      {message && (
        <output
          aria-live="polite"
          className={cn(
            "rounded-2xl px-3 py-2 font-mono text-xs shadow-[var(--trail-shadow-border)]",
            message.kind === "ok" && "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
            message.kind === "err" && "text-rose-300 bg-rose-500/10 border-rose-500/30",
            message.kind === "info" && "text-sky-300 bg-sky-500/10 border-sky-500/30",
          )}
        >
          {message.text}
        </output>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Connect modal
// ────────────────────────────────────────────────────────────────────────────

function ConnectModal({
  vendor,
  busy,
  onClose,
  onSubmit,
}: {
  vendor: VendorMeta;
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    apiKey: string,
    workspaceId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const titleId = useId();
  const apiKeyRef = useRef<HTMLInputElement | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    apiKeyRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, onClose]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (apiKey.trim().length < 8) {
      setError("Key must be at least 8 characters.");
      return;
    }
    const result = await onSubmit(apiKey, workspaceId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setApiKey("");
    setWorkspaceId("");
  }

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-black/70 p-4 backdrop:opacity-0 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-zinc-950 shadow-[var(--trail-shadow-border-hover)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-900 p-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-zinc-300 shadow-[var(--trail-shadow-border)]">
              <VendorIcon id={vendor.id} />
            </span>
            <div>
              <h2 id={titleId} className="text-sm font-semibold tracking-tight text-zinc-100">
                Connect {vendor.name}
              </h2>
              <p className="text-xs text-zinc-500">{vendor.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lg leading-none text-zinc-500 transition-[background-color,color,transform] hover:bg-zinc-900 hover:text-zinc-100 active:scale-[0.96]"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {!vendor.live && (
            <div className="rounded-2xl bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.28)]">
              Coming soon — currently anthropic only. Your key will be saved but sync will not run
              until support lands.
            </div>
          )}

          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              API key
            </div>
            <input
              ref={apiKeyRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={vendor.keyPlaceholder}
              className="w-full rounded-2xl bg-black/35 px-4 py-3 font-mono text-sm text-zinc-100 shadow-[var(--trail-shadow-border)] outline-none transition-[box-shadow,background-color] placeholder:text-zinc-700 focus:bg-zinc-950 focus:shadow-[0_0_0_1px_rgba(167,243,0,0.45),0_18px_48px_rgba(0,0,0,0.24)]"
            />
            <div className="mt-2 text-xs leading-5 text-zinc-600">{vendor.keyHint}</div>
          </label>

          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Workspace ID{" "}
              <span className="text-zinc-600 normal-case tracking-normal">— optional</span>
            </div>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder={vendor.workspacePlaceholder}
              className="w-full rounded-2xl bg-black/35 px-4 py-3 font-mono text-sm text-zinc-100 shadow-[var(--trail-shadow-border)] outline-none transition-[box-shadow,background-color] placeholder:text-zinc-700 focus:bg-zinc-950 focus:shadow-[0_0_0_1px_rgba(167,243,0,0.45),0_18px_48px_rgba(0,0,0,0.24)]"
            />
            <div className="mt-2 text-xs text-zinc-600">Leave blank for org-wide usage.</div>
          </label>

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-200 shadow-[0_0_0_1px_rgba(244,63,94,0.3)]"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-black px-3 font-mono text-xs text-zinc-100 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#a7f300] px-4 font-mono text-xs font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-[#b9ff1f] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save key"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
