"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

type ToolCtx = { markdown: string; rules: string; firstPrompt: string };

type Tool = {
  key: string;
  label: string;
  hint: string;
  /** Build a deep-link from the kit context, or null to fall back to copy. */
  deepLink?: (ctx: ToolCtx) => string | null;
  /** Clipboard payload when there's no deep-link. */
  copy?: (ctx: ToolCtx) => string;
};

// Cursor's deep-link carries the prompt as a URL param, so keep the seed within
// a safe length: the first prompt plus a short rules preamble when present.
const MAX_CURSOR_SEED = 6000;

function buildCursorSeed(ctx: ToolCtx): string {
  const parts: string[] = [];
  if (ctx.firstPrompt) parts.push(ctx.firstPrompt);
  if (ctx.rules) parts.push(`\n\n--- Apply these project rules ---\n${ctx.rules}`);
  return parts.join("").slice(0, MAX_CURSOR_SEED);
}

const TOOLS: Tool[] = [
  {
    key: "cursor",
    label: "Open in Cursor",
    hint: "Deep-links the setup prompt + rules into a new Cursor chat",
    deepLink: (ctx) => {
      const seed = buildCursorSeed(ctx);
      return seed
        ? `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(seed)}`
        : null;
    },
  },
  {
    key: "claude",
    label: "Copy for Claude Code",
    hint: "Copies the rules + prompts bundle to paste into Claude Code",
    copy: ({ markdown }) => markdown,
  },
  {
    key: "codex",
    label: "Copy for Codex",
    hint: "Copies the full kit bundle",
    copy: ({ markdown }) => markdown,
  },
  {
    key: "windsurf",
    label: "Copy for Windsurf",
    hint: "Copies the setup prompt + rules",
    copy: ({ markdown }) => markdown,
  },
];

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function StealKit({
  kitId,
  sourceRepo,
  markdown,
  rulesText,
  firstPrompt,
  signedIn,
  signInHref,
  initialReuseCount,
}: {
  kitId: string;
  sourceRepo: string;
  markdown: string;
  rulesText: string;
  firstPrompt: string;
  signedIn: boolean;
  signInHref: string;
  initialReuseCount: number;
}) {
  const [reuseCount, setReuseCount] = useState(initialReuseCount);
  const [done, setDone] = useState<string | null>(null);

  // Fire-and-forget reuse tracking; never blocks the actual steal action.
  function track(target: string) {
    if (!signedIn) return;
    fetch(`/api/kit/${kitId}/reuse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { recorded?: boolean; reuseCount?: number } | null) => {
        if (d && typeof d.reuseCount === "number") setReuseCount(d.reuseCount);
      })
      .catch(() => {});
  }

  function flash(key: string) {
    setDone(key);
    setTimeout(() => setDone((k) => (k === key ? null : k)), 2000);
  }

  function handleTool(tool: Tool) {
    if (!signedIn) {
      window.location.href = signInHref;
      return;
    }
    if (tool.deepLink) {
      const href = tool.deepLink({ markdown, rules: rulesText, firstPrompt });
      if (href) {
        track(tool.key);
        window.location.href = href;
        flash(tool.key);
        return;
      }
    }
    const payload = tool.copy?.({ markdown, rules: rulesText, firstPrompt }) ?? markdown;
    navigator.clipboard?.writeText(payload).catch(() => {});
    track(tool.key);
    flash(tool.key);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[12px] text-zinc-600">Steal this build into your tool</div>
        <div className="font-mono text-[11px] text-zinc-500 tabular-nums">
          🔁 {reuseCount} {reuseCount === 1 ? "fork" : "forks"}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/[0.08] sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={() => handleTool(tool)}
            title={tool.hint}
            className="bg-[var(--surface-deep)] px-3 py-3 text-left transition-[background-color,transform] hover:bg-white/[0.035] active:scale-[0.99]"
          >
            <div className="text-[13px] font-medium text-zinc-200">{tool.label}</div>
            <div className="mt-0.5 text-[12px] text-zinc-600">
              {done === tool.key ? "done!" : tool.deepLink ? "open via deep-link" : "copy bundle"}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-zinc-600">
        <button
          type="button"
          onClick={() => {
            if (!signedIn) {
              window.location.href = signInHref;
              return;
            }
            download(`trail-kit-${sourceRepo.replace("/", "-")}.md`, markdown);
            track("download");
            flash("download");
          }}
          className={cn("hover:text-zinc-200", done === "download" && "text-[var(--accent-text)]")}
        >
          {done === "download" ? "Downloaded" : "Download kit (.md)"}
        </button>
        {rulesText ? (
          <>
            <span className="opacity-50">·</span>
            <button
              type="button"
              onClick={() => {
                if (!signedIn) {
                  window.location.href = signInHref;
                  return;
                }
                navigator.clipboard?.writeText(rulesText).catch(() => {});
                track("copy");
                flash("copy");
              }}
              className={cn("hover:text-zinc-200", done === "copy" && "text-[var(--accent-text)]")}
            >
              {done === "copy" ? "Copied" : "Copy rules only"}
            </button>
          </>
        ) : null}
      </div>
      {!signedIn ? (
        <p className="mt-3 text-[12px] text-zinc-600">
          <a href={signInHref} className="text-[var(--accent-text)] hover:underline">
            Sign in
          </a>{" "}
          to steal this build into your tool.
        </p>
      ) : null}
    </div>
  );
}
