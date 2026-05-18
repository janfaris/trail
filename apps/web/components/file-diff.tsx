"use client";
import dynamic from "next/dynamic";

const DiffViewer = dynamic(() => import("react-diff-viewer-continued"), { ssr: false });

const darkStyles = {
  variables: {
    dark: {
      diffViewerBackground: "#09090b",
      diffViewerColor: "#e4e4e7",
      addedBackground: "rgba(167, 243, 0, 0.08)",
      addedColor: "#d8ffa1",
      removedBackground: "rgba(244, 63, 94, 0.08)",
      removedColor: "#fda4af",
      wordAddedBackground: "rgba(167, 243, 0, 0.22)",
      wordRemovedBackground: "rgba(244, 63, 94, 0.22)",
      addedGutterBackground: "rgba(167, 243, 0, 0.12)",
      removedGutterBackground: "rgba(244, 63, 94, 0.12)",
      gutterBackground: "#09090b",
      gutterBackgroundDark: "#09090b",
      highlightBackground: "#18181b",
      highlightGutterBackground: "#18181b",
      codeFoldGutterBackground: "#18181b",
      codeFoldBackground: "#18181b",
      emptyLineBackground: "#0b0b0e",
      gutterColor: "#52525b",
      addedGutterColor: "#a7f300",
      removedGutterColor: "#fda4af",
      codeFoldContentColor: "#71717a",
      diffViewerTitleBackground: "#0b0b0e",
      diffViewerTitleColor: "#a1a1aa",
      diffViewerTitleBorderColor: "#27272a",
    },
  },
  line: {
    padding: "2px 8px",
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    fontSize: "12px",
    lineHeight: "1.55",
  },
  gutter: {
    minWidth: "44px",
    padding: "0 8px",
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    fontSize: "11px",
  },
  contentText: {
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  },
} as const;

export function FileDiff({ path, before, after }: { path: string; before: string; after: string }) {
  return (
    <div className="rounded-md border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800 font-mono text-xs text-zinc-300 flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 1.5h6L13 5.5v9H3z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            opacity="0.6"
          />
          <path d="M9 1.5v4h4" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
        </svg>
        <span className="text-zinc-400">{path}</span>
      </div>
      <div className="text-xs">
        <DiffViewer
          oldValue={before}
          newValue={after}
          splitView={false}
          useDarkTheme
          hideLineNumbers={false}
          styles={darkStyles}
        />
      </div>
    </div>
  );
}
