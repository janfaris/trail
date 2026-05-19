// Visual twin of LanguagesBar with a slightly cooler palette to distinguish
// tool action mix from language mix.
const PALETTE = [
  "#a7f300",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#facc15",
  "#4ade80",
];

export type ToolItem = { name: string; count: number; pct: number };

function color(idx: number): string {
  return PALETTE[idx % PALETTE.length];
}

export function ToolMixBar({ tools }: { tools: ToolItem[] }) {
  const total = tools.reduce((n, t) => n + t.count, 0);
  if (total === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex h-2 w-full overflow-hidden rounded-sm bg-zinc-900">
        {tools.map((t, i) => (
          <div
            key={t.name}
            style={{ width: `${(t.count / total) * 100}%`, backgroundColor: color(i) }}
            title={`${t.name} ${Math.round((t.count / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-zinc-400">
        {tools.map((t, i) => (
          <span key={t.name} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-[1px]"
              style={{ backgroundColor: color(i) }}
            />
            <span className="text-zinc-300">{t.name}</span>
            <span className="text-zinc-500 tabular-nums">
              {Math.round((t.count / total) * 100)}%
            </span>
            {i < tools.length - 1 && <span className="text-zinc-700 ml-1">·</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
