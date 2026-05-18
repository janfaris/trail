"use client";
import dynamic from "next/dynamic";

const DiffViewer = dynamic(() => import("react-diff-viewer-continued"), { ssr: false });

export function FileDiff({ path, before, after }: { path: string; before: string; after: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 font-mono text-xs text-zinc-400">
        {path}
      </div>
      <div className="text-xs">
        <DiffViewer
          oldValue={before}
          newValue={after}
          splitView={false}
          useDarkTheme
          hideLineNumbers={false}
        />
      </div>
    </div>
  );
}
