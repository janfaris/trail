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
    deepLink: (p) => `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(p)}`,
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
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-3 text-[12px] text-zinc-600">Fork into your AI tool</div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/[0.08] sm:grid-cols-2">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleClick(t)}
            className="bg-[var(--surface-deep)] px-3 py-3 text-left transition-[background-color,transform] hover:bg-white/[0.035] active:scale-[0.99]"
            title={t.hint}
          >
            <div className="text-[13px] font-medium text-zinc-200">{t.label}</div>
            <div className="mt-0.5 text-[12px] text-zinc-600">
              {copied === t.key ? "copied!" : t.deepLink ? "open via deep-link" : "copy command"}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-zinc-600">
        <button
          type="button"
          onClick={() => {
            if (copyToClipboard(setupPrompt)) {
              setCopied("setup");
              setTimeout(() => setCopied((c) => (c === "setup" ? null : c)), 2000);
            }
          }}
          className="hover:text-zinc-200"
        >
          {copied === "setup" ? "Copied" : "Copy setup prompt"}
        </button>
        <span className="opacity-50">·</span>
        <a href={forkUrl} className="hover:text-zinc-200" target="_blank" rel="noreferrer">
          View raw recipe (.md)
        </a>
      </div>
    </div>
  );
}
