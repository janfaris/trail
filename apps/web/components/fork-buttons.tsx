"use client";

import { useState } from "react";

interface ForkButtonsProps {
  /** Public URL of the session, e.g. https://gettrail.../u/x/y. */
  shareUrl: string;
  /** Markdown fork URL (raw recipe text). */
  forkUrl: string;
  /** Raw setup prompt text — used by "Copy setup prompt" button. */
  setupPrompt: string;
}

interface ToolButton {
  key: string;
  label: string;
  hint: string;
  /** Returns a deep-link href (or `null` if the tool only supports copy-prompt). */
  deepLink?: (setupPrompt: string, shareUrl: string) => string | null;
  /** CLI command to copy (falls back when no deep-link). */
  cli?: (forkUrl: string) => string;
}

const TOOLS: ToolButton[] = [
  {
    key: "claude-code",
    label: "Open in Claude Code",
    hint: "Pipes the recipe into `claude code` via stdin",
    cli: (fu) => `curl -s ${fu} | claude code`,
  },
  {
    key: "cursor",
    label: "Open in Cursor",
    hint: "Deep-links the setup prompt into a new Cursor chat",
    deepLink: (p) =>
      `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(p)}`,
  },
  {
    key: "codex",
    label: "Open in Codex",
    hint: "`codex` reads the recipe URL and resumes from the setup prompt",
    cli: (fu) => `codex --resume ${fu}`,
  },
  {
    key: "hermes",
    label: "Open in Hermes",
    hint: "`hermes resume <url>` loads the recipe into a new session",
    cli: (fu) => `hermes resume ${fu}`,
  },
  {
    key: "windsurf",
    label: "Open in Windsurf",
    hint: "Copy the setup prompt into a Windsurf chat",
  },
  {
    key: "trail-cli",
    label: "Open with `trail open`",
    hint: "Auto-detects whichever AI tool you've got installed",
    cli: (fu) => `trail open ${fu}`,
  },
];

function copyToClipboard(text: string): boolean {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  navigator.clipboard.writeText(text).catch(() => {});
  return true;
}

export function ForkButtons({ shareUrl, forkUrl, setupPrompt }: ForkButtonsProps) {
  const [copied, setCopied] = useState<string | null>(null);

  function handleClick(t: ToolButton) {
    if (t.deepLink) {
      const href = t.deepLink(setupPrompt, shareUrl);
      if (href) {
        window.location.href = href;
        return;
      }
    }
    const cmd = t.cli ? t.cli(forkUrl) : setupPrompt;
    if (copyToClipboard(cmd)) {
      setCopied(t.key);
      setTimeout(() => setCopied((c) => (c === t.key ? null : c)), 2000);
    }
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-3">
        Fork into your AI tool
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleClick(t)}
            className="text-left rounded border border-zinc-800 hover:border-[#a7f300]/60 hover:bg-zinc-900 px-3 py-2 transition-colors"
            title={t.hint}
          >
            <div className="text-sm font-medium text-zinc-100">{t.label}</div>
            <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
              {copied === t.key
                ? "copied!"
                : t.deepLink
                  ? "open via deep-link"
                  : "copy command"}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono text-zinc-500">
        <button
          type="button"
          onClick={() => {
            if (copyToClipboard(setupPrompt)) {
              setCopied("setup");
              setTimeout(() => setCopied((c) => (c === "setup" ? null : c)), 2000);
            }
          }}
          className="hover:text-zinc-100"
        >
          {copied === "setup" ? "✓ copied" : "Copy setup prompt"}
        </button>
        <span className="opacity-50">·</span>
        <a href={forkUrl} className="hover:text-zinc-100" target="_blank" rel="noreferrer">
          View raw recipe (.md)
        </a>
      </div>
    </div>
  );
}
