"use client";
import { createTwoFilesPatch } from "diff";
import { useMemo, useState } from "react";

export function FileDiff({ path, before, after }: { path: string; before: string; after: string }) {
  const [open, setOpen] = useState(false);

  const lines = useMemo(() => {
    const patch = createTwoFilesPatch(path, path, before ?? "", after ?? "", "", "", {
      context: 3,
    });
    // Drop the 4 header lines emitted by createTwoFilesPatch (Index, ===, ---, +++).
    const raw = patch.split("\n");
    // Find first hunk header (starts with @@); everything before that is header noise.
    const firstHunk = raw.findIndex((l) => l.startsWith("@@"));
    const body = firstHunk >= 0 ? raw.slice(firstHunk) : raw;
    // Trim trailing empty line
    if (body.length && body[body.length - 1] === "") body.pop();
    return body;
  }, [path, before, after]);

  const stats = useMemo(() => {
    let adds = 0;
    let dels = 0;
    for (const l of lines) {
      if (l.startsWith("+") && !l.startsWith("+++")) adds++;
      else if (l.startsWith("-") && !l.startsWith("---")) dels++;
    }
    return { adds, dels };
  }, [lines]);

  return (
    <div className="rounded-md border border-white/10 overflow-hidden bg-zinc-950">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2 bg-zinc-900/60 border-b border-white/10 font-mono text-xs text-zinc-300 flex items-center gap-2 hover:bg-zinc-900 transition-colors text-left"
        aria-expanded={open}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
          className={`text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path
            d="M3 1.5L6.5 5L3 8.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-zinc-400 flex-1 truncate">{path}</span>
        {stats.adds > 0 && <span className="text-emerald-400">+{stats.adds}</span>}
        {stats.dels > 0 && <span className="text-rose-400">-{stats.dels}</span>}
      </button>
      {open && (
        <div className="text-xs font-mono leading-relaxed overflow-x-auto bg-zinc-950">
          {lines.length === 0 ? (
            <div className="px-4 py-3 text-zinc-500">No changes</div>
          ) : (
            <pre className="m-0 py-2">
              {lines.map((line, i) => {
                let cls = "text-zinc-400";
                let bg = "";
                if (line.startsWith("@@")) {
                  cls = "text-zinc-500";
                  bg = "bg-zinc-900/60";
                } else if (line.startsWith("+") && !line.startsWith("+++")) {
                  cls = "text-emerald-300";
                  bg = "bg-emerald-500/10";
                } else if (line.startsWith("-") && !line.startsWith("---")) {
                  cls = "text-rose-300";
                  bg = "bg-rose-500/10";
                } else {
                  cls = "text-zinc-400";
                }
                return (
                  <div key={i} className={`px-4 whitespace-pre ${bg} ${cls}`}>
                    {line || " "}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
