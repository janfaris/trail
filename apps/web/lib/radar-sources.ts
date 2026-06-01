export type RadarCategory =
  | "model_release"
  | "benchmark"
  | "framework_update"
  | "tool_workflow"
  | "rumor"
  | "security"
  | "research"
  | "funding"
  | "tutorial"
  | "other";

export type RadarSource = {
  handle: string;
  name: string;
  role: string;
  priority: number;
};

export const RADAR_X_SOURCES: RadarSource[] = [
  { handle: "swyx", name: "swyx", role: "AI engineering + agents", priority: 1 },
  { handle: "karpathy", name: "Andrej Karpathy", role: "models + AI education", priority: 1 },
  { handle: "simonw", name: "Simon Willison", role: "LLM tools + security", priority: 1 },
  { handle: "levelsio", name: "Pieter Levels", role: "indie AI apps", priority: 2 },
  { handle: "bindureddy", name: "Bindu Reddy", role: "models + product signals", priority: 2 },
  { handle: "testingcatalog", name: "TestingCatalog", role: "AI product releases", priority: 2 },
  { handle: "markgurman", name: "Mark Gurman", role: "platform + Apple AI", priority: 3 },
  { handle: "kimmonismus", name: "Chubby", role: "model leaks + benchmarks", priority: 2 },
];

export const RADAR_QUERY_KEYWORDS = [
  "AI",
  "agent",
  "agents",
  "Claude",
  "Codex",
  "Cursor",
  "OpenAI",
  "GPT",
  "Gemini",
  "Grok",
  "model",
  "benchmark",
  "eval",
  "framework",
  "coding",
  "devtools",
  "leak",
  "release",
];

export const RADAR_CATEGORIES: Array<{
  id: RadarCategory;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "model_release",
    label: "Model releases",
    shortLabel: "Models",
    description: "New or changed model capabilities builders should test in real work.",
  },
  {
    id: "benchmark",
    label: "Benchmarks",
    shortLabel: "Benchmarks",
    description: "Eval claims that need receipts, not just screenshots.",
  },
  {
    id: "framework_update",
    label: "Framework updates",
    shortLabel: "Frameworks",
    description: "SDK, framework, and platform changes likely to affect implementation.",
  },
  {
    id: "tool_workflow",
    label: "Tool workflows",
    shortLabel: "Tools",
    description: "Agent, editor, prompt, and workflow moves worth stealing.",
  },
  {
    id: "rumor",
    label: "Leaks and rumors",
    shortLabel: "Rumors",
    description: "Unconfirmed claims that should stay marked unverified until receipts exist.",
  },
  {
    id: "security",
    label: "Security",
    shortLabel: "Security",
    description: "Prompt injection, auth, supply chain, and agent safety signals.",
  },
  {
    id: "research",
    label: "Research",
    shortLabel: "Research",
    description: "Papers and technical findings builders can convert into experiments.",
  },
  {
    id: "funding",
    label: "Business",
    shortLabel: "Business",
    description: "Launches, acquisitions, funding, pricing, and AI market movement.",
  },
  {
    id: "tutorial",
    label: "Tutorials",
    shortLabel: "Tutorials",
    description: "Guides and walkthroughs that can become reusable Trail lessons.",
  },
  {
    id: "other",
    label: "Other signals",
    shortLabel: "Other",
    description: "Useful AI builder signals that do not fit a tighter bucket yet.",
  },
];

export function radarCategoryLabel(category: string): string {
  return RADAR_CATEGORIES.find((item) => item.id === category)?.label ?? "Other signals";
}

export function buildRadarSourceQuery(handle: string): string {
  return `from:${handle} (${RADAR_QUERY_KEYWORDS.join(" OR ")}) -is:reply`;
}
