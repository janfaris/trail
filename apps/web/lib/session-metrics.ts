// Pure helpers to derive per-session metrics from event payloads.
// Used both on upload ingest and in the backfill route.

const EXT_TO_LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python",
  swift: "Swift",
  rs: "Rust",
  go: "Go",
  rb: "Ruby",
  java: "Java",
  kt: "Kotlin",
  cs: "C#",
  cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++",
  c: "C", h: "C",
  sql: "SQL",
  sh: "Shell", bash: "Shell", zsh: "Shell",
  html: "HTML",
  css: "CSS", scss: "CSS", sass: "CSS",
  md: "Markdown", mdx: "Markdown",
  json: "JSON",
  yaml: "YAML", yml: "YAML",
  toml: "TOML",
  xml: "XML",
  vue: "Vue",
  svelte: "Svelte",
  lua: "Lua",
  php: "PHP",
  ex: "Elixir", exs: "Elixir",
  erl: "Erlang",
  dart: "Dart",
  scala: "Scala",
  clj: "Clojure",
  hs: "Haskell",
  ml: "OCaml",
  nix: "Nix",
};

const EDIT_TOOLS = new Set([
  "read_file", "write_file", "patch", "edit", "replace",
  "str_replace", "create_file", "apply_patch",
]);

function pathToLang(p: string | undefined | null): string | null {
  if (!p || typeof p !== "string") return null;
  const base = p.split("/").pop() ?? p;
  if (base === "Dockerfile" || base.endsWith(".dockerfile")) return "Dockerfile";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

export function extractLanguages(
  events: Array<{ kind: string; payload?: unknown; data?: unknown }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.kind !== "tool_call") continue;
    const p = (e.payload ?? e.data) as { name?: string; args?: { path?: string } } | undefined;
    if (!p || !p.name || !EDIT_TOOLS.has(p.name)) continue;
    const lang = pathToLang(p.args?.path);
    if (!lang) continue;
    counts[lang] = (counts[lang] ?? 0) + 1;
  }
  return counts;
}

export function computeDurationSeconds(
  startedAt: Date | null,
  endedAt: Date | null,
  events: Array<{ at: string | Date }>,
): number | null {
  let start = startedAt ? startedAt.getTime() : NaN;
  let end = endedAt ? endedAt.getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    const times = events
      .map((e) => (e.at instanceof Date ? e.at.getTime() : Date.parse(String(e.at))))
      .filter((n) => Number.isFinite(n));
    if (times.length === 0) return null;
    if (!Number.isFinite(start)) start = Math.min(...times);
    if (!Number.isFinite(end)) end = Math.max(...times);
  }
  const secs = Math.round((end - start) / 1000);
  if (secs < 0 || secs > 24 * 3600) return null;
  return secs;
}

type ToolCallEvent = {
  kind: string;
  payload?: unknown;
  data?: unknown;
};

function toolCallPayload(e: ToolCallEvent): {
  name?: string;
  args?: { path?: string };
  result?: { success?: boolean; error?: unknown };
} | null {
  if (e.kind !== "tool_call") return null;
  return (e.payload ?? e.data) as {
    name?: string;
    args?: { path?: string };
    result?: { success?: boolean; error?: unknown };
  } | null;
}

export function extractToolCallCounts(
  events: ToolCallEvent[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const p = toolCallPayload(e);
    if (!p?.name) continue;
    counts[p.name] = (counts[p.name] ?? 0) + 1;
  }
  return counts;
}

export function countDistinctFiles(events: ToolCallEvent[]): number {
  const set = new Set<string>();
  for (const e of events) {
    const p = toolCallPayload(e);
    const path = p?.args?.path;
    if (typeof path === "string" && path.length > 0) set.add(path);
  }
  return set.size;
}

export function countPrompts(events: Array<{ kind: string }>): number {
  let n = 0;
  for (const e of events) if (e.kind === "prompt") n++;
  return n;
}

export function countFailedToolCalls(events: ToolCallEvent[]): number {
  let n = 0;
  for (const e of events) {
    const p = toolCallPayload(e);
    if (!p) continue;
    const r = p.result;
    if (!r) continue;
    if (r.success === false || r.error != null) n++;
  }
  return n;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  if (seconds < 60) return "0m";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
