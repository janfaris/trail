// Color palette for the languages bar. Top language always uses the
// brand accent so it pops; secondary slots cycle through complementary hues.
const PALETTE = [
  "#a7f300",
  "#4ade80",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#facc15",
];

export function languageColor(idx: number): string {
  return PALETTE[idx % PALETTE.length];
}

export type LangCount = { name: string; count: number };

export function topLanguages(
  sessions: Array<{ languages: Record<string, number> | null }>,
  limit = 5,
): LangCount[] {
  const totals: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.languages) continue;
    for (const [k, v] of Object.entries(s.languages)) {
      totals[k] = (totals[k] ?? 0) + (typeof v === "number" ? v : 0);
    }
  }
  return Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function LanguagesBar({ langs }: { langs: LangCount[] }) {
  const total = langs.reduce((n, l) => n + l.count, 0);
  if (total === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex h-2 w-full overflow-hidden rounded-sm bg-zinc-900">
        {langs.map((l, i) => (
          <div
            key={l.name}
            style={{ width: `${(l.count / total) * 100}%`, backgroundColor: languageColor(i) }}
            title={`${l.name} ${Math.round((l.count / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-zinc-400">
        {langs.map((l, i) => (
          <span key={l.name} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-[1px]"
              style={{ backgroundColor: languageColor(i) }}
            />
            <span className="text-zinc-300">{l.name}</span>
            <span className="text-zinc-500 tabular-nums">
              {Math.round((l.count / total) * 100)}%
            </span>
            {i < langs.length - 1 && <span className="text-zinc-700 ml-1">·</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
