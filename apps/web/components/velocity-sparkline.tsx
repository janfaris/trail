// Tiny inline SVG sparkline. weeks oldest-first, 12 values.
export function VelocitySparkline({ weeks }: { weeks: number[] }) {
  const W = 96;
  const H = 24;
  const n = weeks.length;
  if (n === 0) return null;
  const max = Math.max(1, ...weeks);
  const stepX = n > 1 ? W / (n - 1) : 0;
  const points = weeks.map((v, i) => {
    const x = i * stepX;
    const y = H - (v / max) * (H - 2) - 1;
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  let minIdx = 0;
  let maxIdx = 0;
  for (let i = 1; i < n; i++) {
    if (weeks[i] < weeks[minIdx]) minIdx = i;
    if (weeks[i] > weeks[maxIdx]) maxIdx = i;
  }
  const current = weeks[n - 1];

  return (
    <div className="inline-flex items-center gap-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block">
        <path
          d={path}
          fill="none"
          className="stroke-[var(--accent-border)]"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {n > 0 && (
          <circle
            cx={points[maxIdx][0]}
            cy={points[maxIdx][1]}
            r={1.6}
            className="fill-[var(--accent-border)]"
          />
        )}
        {n > 0 && minIdx !== maxIdx && (
          <circle
            cx={points[minIdx][0]}
            cy={points[minIdx][1]}
            r={1.6}
            className="fill-[var(--accent-border)]"
            opacity={0.5}
          />
        )}
      </svg>
      <span className="font-mono text-xs text-zinc-400 tabular-nums">{current}/wk</span>
    </div>
  );
}
