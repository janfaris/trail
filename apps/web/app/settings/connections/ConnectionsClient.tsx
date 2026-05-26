"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

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
    keyPlaceholder: "sk-ant-admin01-…",
    keyHint: "Admin key from console.anthropic.com → Settings → Admin Keys. Starts with sk-ant-admin01-.",
    workspacePlaceholder: "ws_… (optional)",
    description: "Claude API org-wide usage and spend.",
  },
  {
    id: "openai",
    name: "OpenAI",
    live: true,
    keyPlaceholder: "sk-admin-…",
    keyHint: "Admin key from platform.openai.com → Organization → Admin keys.",
    workspacePlaceholder: "org-… (optional)",
    description: "OpenAI org-wide usage and spend.",
  },
  {
    id: "cursor",
    name: "Cursor",
    live: true,
    keyPlaceholder: "Cursor admin key",
    keyHint: "Real sync uses the local CLI uploader; this entry just registers your account.",
    workspacePlaceholder: "team-id (optional)",
    description: "Cursor team / per-user usage.",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    live: true,
    keyPlaceholder: "ghp_… or github_pat_…",
    keyHint: "GitHub PAT with admin:org scope. Needs the org login below to query the Copilot Metrics API.",
    workspacePlaceholder: "org login (required)",
    description: "Copilot Enterprise / Business engagement (no per-user token counts; aggregate only).",
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
  if (s === "ok" || s === "pending" || s === "auth_error" || s === "rate_limited")
    return s;
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
  const [messages, setMessages] = useState<Record<string, CardMessage | undefined>>(
    {},
  );
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

  const openModal = useCallback(
    (vendor: VendorMeta, trigger: HTMLButtonElement | null) => {
      triggerRef.current = trigger;
      setModalVendor(vendor);
    },
    [],
  );

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
    if (
      !window.confirm(
        `Disconnect ${vendor.name}? Future syncs will stop until you reconnect.`,
      )
    ) {
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
  const [syncBanner, setSyncBanner] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const hasConnections = initialConnections.length > 0;

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncBanner(null);
    try {
      const res = await fetch("/api/connections/sync-now", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        runs?: Array<{ vendor: string; status: string; rowsInserted: number; errorMessage?: string }>;
        message?: string;
        error?: string;
      };
      if (res.status === 429) {
        setSyncBanner({ kind: "info", text: data.message ?? "Sync cooldown active. Try again in a moment." });
      } else if (!res.ok) {
        setSyncBanner({ kind: "err", text: data.error ?? "Sync failed. Check the page console." });
      } else {
        const runs = data.runs ?? [];
        if (runs.length === 0) {
          setSyncBanner({ kind: "info", text: data.message ?? "Nothing to sync yet — add a vendor first." });
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
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 mb-2">
        Vendor connections
      </h1>
      <p className="text-sm text-zinc-400 mb-4 max-w-2xl leading-relaxed">
        Trail attributes spend to merged PRs. To do that, we need read-only
        access to your vendor billing APIs. Encrypted with libsodium, used only
        at sync time, revocable in one click.
      </p>

      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300 leading-relaxed max-w-3xl">
        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-1.5">
          No admin key? Local capture still works.
        </div>
        Install the CLI and run <code className="font-mono text-[12.5px] text-[#a7f300]">trail record</code> — Trail tails the JSONL logs your AI tools already write (Claude Code, Codex) and prices each session against the model_price table. No vendor admin keys required for those. Cursor and Copilot need admin connections for accurate per-PR cost (no public per-user token API).
      </div>

      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSyncNow}
          disabled={syncing || !hasConnections}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md text-[13px] font-medium bg-[#a7f300] text-zinc-950 hover:bg-[#b9ff1f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? "Syncing…" : "Run sync now"}
        </button>
        <span className="text-[12px] font-mono text-zinc-500">
          {hasConnections
            ? "Fetches the latest billing buckets for your connections."
            : "Connect a vendor first to enable manual sync."}
        </span>
      </div>

      {syncBanner && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mb-6 rounded-md border px-3 py-2 text-[13px]",
            syncBanner.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : syncBanner.kind === "err"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-sky-500/30 bg-sky-500/10 text-sky-200",
          )}
        >
          {syncBanner.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {VENDORS.map((v) => {
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300">
            <VendorIcon id={vendor.id} />
          </span>
          <div>
            <div className="text-sm font-semibold text-zinc-100">
              {vendor.name}
            </div>
            <div className="text-xs text-zinc-500">{vendor.description}</div>
          </div>
        </div>
        {!vendor.live && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
            Soon
          </span>
        )}
      </div>

      {connection ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono",
                STATUS_CLASSES[kind],
              )}
            >
              {STATUS_LABEL[kind]}
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              Last sync: {relativeTime(connection.lastSyncedAt)}
            </span>
          </div>
          {connection.workspaceId && (
            <div className="text-xs text-zinc-500">
              Workspace:{" "}
              <span className="font-mono text-zinc-400">
                {connection.workspaceId}
              </span>
            </div>
          )}
          {connection.syncErrorMessage && (
            <div className="text-xs text-rose-300/90 font-mono break-words">
              {connection.syncErrorMessage}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onTest}
              className="inline-flex items-center justify-center rounded-md border border-zinc-800 bg-transparent hover:bg-zinc-900 text-zinc-100 text-xs font-mono h-8 px-3 disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? "Testing…" : "Test"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDisconnect}
              className="inline-flex items-center justify-center rounded-md border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs font-mono h-8 px-3 disabled:opacity-50 disabled:pointer-events-none"
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
            className="inline-flex items-center justify-center rounded-md bg-[#a7f300] hover:bg-[#b9ff1f] text-zinc-950 text-xs font-mono font-semibold h-8 px-3 disabled:opacity-50 disabled:pointer-events-none"
          >
            Connect
          </button>
          <span className="text-xs text-zinc-500">Not connected</span>
        </div>
      )}

      {message && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "text-xs font-mono rounded border px-2 py-1.5",
            message.kind === "ok" &&
              "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
            message.kind === "err" &&
              "text-rose-300 bg-rose-500/10 border-rose-500/30",
            message.kind === "info" &&
              "text-sky-300 bg-sky-500/10 border-sky-500/30",
          )}
        >
          {message.text}
        </div>
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-900">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300">
              <VendorIcon id={vendor.id} />
            </span>
            <div>
              <h2
                id={titleId}
                className="text-sm font-semibold tracking-tight text-zinc-100"
              >
                Connect {vendor.name}
              </h2>
              <p className="text-xs text-zinc-500">{vendor.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-100 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!vendor.live && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs font-mono px-3 py-2">
              Coming soon — currently anthropic only. Your key will be saved but
              sync will not run until support lands.
            </div>
          )}

          <label className="block">
            <div className="text-xs font-mono uppercase tracking-[0.14em] text-zinc-500 mb-1.5">
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
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#a7f300]/60"
            />
            <div className="text-xs text-zinc-600 mt-1">{vendor.keyHint}</div>
          </label>

          <label className="block">
            <div className="text-xs font-mono uppercase tracking-[0.14em] text-zinc-500 mb-1.5">
              Workspace ID{" "}
              <span className="text-zinc-600 normal-case tracking-normal">
                — optional
              </span>
            </div>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder={vendor.workspacePlaceholder}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#a7f300]/60"
            />
            <div className="text-xs text-zinc-600 mt-1">
              Leave blank for org-wide usage.
            </div>
          </label>

          {error && (
            <div
              role="alert"
              className="rounded border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs font-mono px-3 py-2"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-md border border-zinc-800 bg-transparent hover:bg-zinc-900 text-zinc-100 text-xs font-mono h-8 px-3 disabled:opacity-50 disabled:pointer-events-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center rounded-md bg-[#a7f300] hover:bg-[#b9ff1f] text-zinc-950 text-xs font-mono font-semibold h-8 px-3 disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? "Saving…" : "Save key"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
