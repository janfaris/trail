// Shared helpers for next/og ImageResponse routes.
// Fonts and tool icons rendered as plain SVG (satori cannot run React components).

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

export const COLORS = {
  bg: "#09090b", // zinc-950
  surface: "#18181b", // zinc-900
  border: "#27272a", // zinc-800
  accent: "#a7f300",
  text: "#fafafa", // zinc-50
  textDim: "#a1a1aa", // zinc-400
  textMute: "#71717a", // zinc-500
  textFaint: "#52525b", // zinc-600
} as const;

// Geist fonts via Google Fonts CDN raw .ttf
async function fetchFont(weight: 400 | 500 | 600 | 700, mono = false): Promise<ArrayBuffer> {
  const family = mono ? "Geist+Mono" : "Geist";
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  ).then((r) => r.text());
  const match = css.match(/src:\s*url\(([^)]+\.ttf)\)/);
  if (!match) throw new Error(`Font url not found for ${family} ${weight}`);
  const buf = await fetch(match[1]).then((r) => r.arrayBuffer());
  return buf;
}

export async function loadOgFonts() {
  const [sans400, sans500, sans600, sans700, mono400, mono500] = await Promise.all([
    fetchFont(400),
    fetchFont(500),
    fetchFont(600),
    fetchFont(700),
    fetchFont(400, true),
    fetchFont(500, true),
  ]);
  return [
    { name: "Geist", data: sans400, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: sans500, weight: 500 as const, style: "normal" as const },
    { name: "Geist", data: sans600, weight: 600 as const, style: "normal" as const },
    { name: "Geist", data: sans700, weight: 700 as const, style: "normal" as const },
    { name: "GeistMono", data: mono400, weight: 400 as const, style: "normal" as const },
    { name: "GeistMono", data: mono500, weight: 500 as const, style: "normal" as const },
  ];
}

// Tool icons → arrays of SVG path/shape elements (satori-safe; no Fragments).
type Shape =
  | { t: "path"; d: string; opacity?: number }
  | { t: "circle"; cx: number; cy: number; r: number; opacity?: number }
  | { t: "rect"; x: number; y: number; width: number; height: number; rx?: number };

const ICONS: Record<string, Shape[]> = {
  "claude-code": [
    { t: "path", d: "M12 4.5A4.5 4.5 0 1 0 12 11.5" },
    { t: "circle", cx: 8, cy: 8, r: 6.5, opacity: 0.25 },
  ],
  claude: [
    { t: "path", d: "M12 4.5A4.5 4.5 0 1 0 12 11.5" },
    { t: "circle", cx: 8, cy: 8, r: 6.5, opacity: 0.25 },
  ],
  codex: [
    { t: "path", d: "M10 4.5a4 4 0 1 0 0 7" },
    { t: "path", d: "M11.5 11.5h2.5M11.5 9.5c0-1 2.5-1 2.5 0 0 .8-2.5 1.2-2.5 2h2.5" },
  ],
  cursor: [{ t: "path", d: "M3 2.5l9.5 5.5L8 9l-1 4.5z" }],
  aider: [
    { t: "path", d: "M3 13L8 3l5 10" },
    { t: "path", d: "M5.2 9.5h5.6" },
  ],
  hermes: [
    { t: "path", d: "M5 3v10M11 3v10M5 8h6" },
    { t: "path", d: "M2.5 6.5l2 1.5M13.5 6.5l-2 1.5", opacity: 0.6 },
  ],
  "copilot-cli": [
    { t: "rect", x: 2, y: 3, width: 12, height: 10, rx: 1.5 },
    { t: "path", d: "M4.5 6.5l2 1.5-2 1.5M8 10.5h3.5" },
  ],
  "copilot-chat": [
    {
      t: "path",
      d: "M2.5 4.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11H4a1.5 1.5 0 0 1-1.5-1.5z",
    },
    { t: "path", d: "M6.5 6L5 7.5 6.5 9M9.5 6L11 7.5 9.5 9", opacity: 0.8 },
  ],
  windsurf: [
    { t: "path", d: "M2 10c2 0 2-2 4-2s2 2 4 2 2-2 4-2" },
    { t: "path", d: "M2 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2", opacity: 0.5 },
  ],
  cline: [
    { t: "rect", x: 2, y: 3, width: 12, height: 10, rx: 2 },
    { t: "path", d: "M5 8h6" },
  ],
  continue: [
    { t: "path", d: "M4 3l5 5-5 5" },
    { t: "path", d: "M9 3l5 5-5 5", opacity: 0.5 },
  ],
  zed: [
    { t: "path", d: "M4 4h8l-8 8h8" },
  ],
  opencode: [
    { t: "circle", cx: 8, cy: 8, r: 5.5 },
    { t: "path", d: "M5.5 7l-1.5 1 1.5 1M10.5 7l1.5 1-1.5 1", opacity: 0.8 },
  ],
};

function renderShape(s: Shape, i: number) {
  if (s.t === "path") return <path key={i} d={s.d} opacity={s.opacity} />;
  if (s.t === "circle") return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} opacity={s.opacity} />;
  return <rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx} />;
}

export function ToolSvg({ name, size = 28, color = COLORS.textDim }: { name: string; size?: number; color?: string }) {
  const shapes = ICONS[name] ?? ([{ t: "circle", cx: 8, cy: 8, r: 5.5 }] as Shape[]);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes.map((s, i) => renderShape(s, i))}
    </svg>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <div style={{ display: "flex", fontFamily: "GeistMono", fontWeight: 600, fontSize: size, letterSpacing: "-0.02em" }}>
      <span style={{ color: COLORS.accent }}>/</span>
      <span style={{ color: COLORS.text }}>trail</span>
    </div>
  );
}

export function Footer() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        right: 64,
        fontFamily: "GeistMono",
        fontSize: 18,
        color: COLORS.textMute,
      }}
    >
      gettrail.vercel.app
    </div>
  );
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
