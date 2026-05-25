type EventRow = { idx: number; kind: string; data: unknown };

export type LlmReceipt = {
  outcome: string;
  tldr: string;
  decisionSummary: string[];
  changedFiles: string[];
  keyPromptIdxs: number[];
};

function eventText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.text === "string") return d.text;
  if (typeof d.name === "string") return d.name;
  try {
    return JSON.stringify(d).slice(0, 400);
  } catch {
    return "";
  }
}

export function buildTranscript(events: EventRow[]): string {
  const lines = events.map((e) => {
    const txt = eventText(e.data).replace(/\s+/g, " ").trim().slice(0, 400);
    return `[idx:${e.idx} kind:${e.kind}] ${txt}`;
  });
  const joined = lines.join("\n");
  const CAP = 12000;
  if (joined.length <= CAP) return joined;
  const head = joined.slice(0, 6000);
  const tail = joined.slice(joined.length - 6000);
  return `${head}\n…[trimmed]…\n${tail}`;
}

function pickString(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function pickStringArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t) continue;
    out.push(t.length > maxLen ? t.slice(0, maxLen) : t);
    if (out.length >= maxItems) break;
  }
  return out;
}

function pickIdxArray(v: unknown, valid: Set<number>, maxItems: number): number[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const x of v) {
    const n = typeof x === "number" ? x : Number(x);
    if (!Number.isFinite(n)) continue;
    const i = Math.trunc(n);
    if (!valid.has(i) || seen.has(i)) continue;
    seen.add(i);
    out.push(i);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function parseLlmReceipt(content: string, validIdxs: Set<number>): LlmReceipt | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  return {
    outcome: pickString(p.outcome, 480),
    tldr: pickString(p.tldr, 140),
    decisionSummary: pickStringArray(p.decisionSummary, 6, 240),
    changedFiles: pickStringArray(p.changedFiles, 20, 200),
    keyPromptIdxs: pickIdxArray(p.keyPromptIdxs, validIdxs, 5),
  };
}
