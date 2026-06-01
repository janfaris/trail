import type { RadarSignalMetrics } from "@/db/schema";
import type { RadarCategory } from "./radar-sources";

export type RadarClassificationInput = {
  text: string;
  metrics?: RadarSignalMetrics | null;
};

export type RadarClassification = {
  category: RadarCategory;
  title: string;
  summary: string;
  whyBuildersCare: string;
  testPrompt: string;
  score: number;
  tags: string[];
};

type CategoryRule = {
  category: RadarCategory;
  keywords: string[];
  whyBuildersCare: string;
  testPrompt: string;
};

const RULES: CategoryRule[] = [
  {
    category: "rumor",
    keywords: ["leak", "leaked", "rumor", "rumour", "unconfirmed", "apparently", "scoop"],
    whyBuildersCare:
      "This is a claim, not proof. Trail should keep it visible as a thing to test without treating it as settled.",
    testPrompt:
      "If the claim affects your stack, run the smallest reproduction in your agent workflow and publish the Trail receipt as proof or disproof.",
  },
  {
    category: "model_release",
    keywords: [
      "new model",
      "model",
      "gpt",
      "claude",
      "gemini",
      "grok",
      "llama",
      "mistral",
      "sonnet",
      "opus",
      "reasoning",
      "multimodal",
      "context window",
    ],
    whyBuildersCare:
      "Model changes only matter when they improve real build loops: planning, coding, debugging, review, or shipping.",
    testPrompt:
      "Run the same Trail-recorded task with your current model and the new model, then compare outcome, retries, time, and cost.",
  },
  {
    category: "benchmark",
    keywords: ["benchmark", "bench", "eval", "score", "leaderboard", "swe-bench", "aider", "arc"],
    whyBuildersCare:
      "Benchmarks create attention, but builders need receipts showing whether the claim holds in everyday repos.",
    testPrompt:
      "Pick one realistic task from your repo, record the agent run, and publish a receipt that confirms or challenges the benchmark.",
  },
  {
    category: "security",
    keywords: [
      "security",
      "prompt injection",
      "jailbreak",
      "vulnerability",
      "cve",
      "supply chain",
      "exploit",
      "auth",
      "sandbox",
    ],
    whyBuildersCare:
      "Agent security issues become real when they touch code, credentials, dependencies, or deploy paths.",
    testPrompt:
      "Try the mitigation in a safe branch, record the fix with Trail, and publish the receipt so others can copy the hardening pattern.",
  },
  {
    category: "framework_update",
    keywords: [
      "framework",
      "next.js",
      "nextjs",
      "react",
      "vite",
      "sdk",
      "api",
      "library",
      "package",
      "typescript",
      "vercel",
      "supabase",
    ],
    whyBuildersCare:
      "Framework and SDK changes are only useful if they reduce friction in a real implementation.",
    testPrompt:
      "Upgrade or prototype the change in a small branch, then publish the Trail receipt with the diff, errors, and final result.",
  },
  {
    category: "tool_workflow",
    keywords: [
      "agent",
      "agents",
      "workflow",
      "prompt",
      "cursor",
      "codex",
      "claude code",
      "copilot",
      "devtool",
      "mcp",
      "automation",
    ],
    whyBuildersCare:
      "Workflow moves are the fastest thing builders can steal if there is proof they work in a real session.",
    testPrompt:
      "Use the workflow on your next bug or feature, record the session, and publish the move as a Trail lesson.",
  },
  {
    category: "research",
    keywords: ["paper", "research", "arxiv", "study", "architecture", "training", "inference"],
    whyBuildersCare:
      "Research is valuable when builders can turn it into smaller, testable implementation moves.",
    testPrompt:
      "Extract one practical claim from the research and test it in a recorded prototype or eval harness.",
  },
  {
    category: "tutorial",
    keywords: ["guide", "tutorial", "walkthrough", "how to", "example", "template", "starter"],
    whyBuildersCare:
      "Tutorials become useful Trail lessons when someone shows the exact steps working in a real repo.",
    testPrompt:
      "Follow the guide in a Trail-recorded session and publish what changed, what failed, and what you would reuse.",
  },
  {
    category: "funding",
    keywords: [
      "funding",
      "raised",
      "acquired",
      "launch",
      "pricing",
      "startup",
      "revenue",
      "business",
    ],
    whyBuildersCare:
      "Business movement hints where tools, budgets, and platforms are shifting for AI builders.",
    testPrompt:
      "If this changes your tool choice, record the migration or trial and publish the decision receipt.",
  },
];

function cleanSignalText(text: string): string {
  return text
    .replace(/^RT\s+@\w+:\s*/i, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSentence(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const slice = value.slice(0, maxLength - 1);
  const sentenceEnd = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
  );
  if (sentenceEnd >= 40) return `${slice.slice(0, sentenceEnd + 1).trim()}`;
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, Math.max(lastSpace, 40)).trim()}...`;
}

function keywordScore(text: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => {
    const normalized = keyword.toLowerCase();
    return text.includes(normalized) ? score + (normalized.includes(" ") ? 2 : 1) : score;
  }, 0);
}

function chooseRule(text: string): CategoryRule {
  const normalized = text.toLowerCase();
  const rumorRule = RULES.find((rule) => rule.category === "rumor");
  if (rumorRule && keywordScore(normalized, rumorRule.keywords) > 0) return rumorRule;

  const ranked = RULES.map((rule, index) => ({
    rule,
    score: keywordScore(normalized, rule.keywords),
    index,
  })).sort((a, b) => b.score - a.score || a.index - b.index);

  return ranked[0]?.score
    ? ranked[0].rule
    : {
        category: "other",
        keywords: [],
        whyBuildersCare:
          "This is a weak but potentially useful AI builder signal. It needs receipts before it deserves strong distribution.",
        testPrompt:
          "Turn the claim into one small experiment, record it with Trail, and publish the result if it teaches another builder something.",
      };
}

function metricValue(
  metrics: RadarSignalMetrics | null | undefined,
  key: keyof RadarSignalMetrics,
) {
  const value = metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function signalScore(metrics: RadarSignalMetrics | null | undefined): number {
  const likes = metricValue(metrics, "like_count");
  const replies = metricValue(metrics, "reply_count");
  const retweets = metricValue(metrics, "retweet_count");
  const quotes = metricValue(metrics, "quote_count");
  const bookmarks = metricValue(metrics, "bookmark_count");
  return Number(
    Math.max(
      0,
      Math.log1p(likes) * 1.6 + replies * 1.4 + retweets * 1.2 + quotes + bookmarks * 0.9,
    ).toFixed(2),
  );
}

function matchedTags(text: string, rule: CategoryRule): string[] {
  const normalized = text.toLowerCase();
  const tags = rule.keywords
    .filter((keyword) => normalized.includes(keyword.toLowerCase()))
    .map((keyword) => keyword.replace(/\s+/g, "-").toLowerCase());
  return Array.from(new Set([rule.category, ...tags])).slice(0, 8);
}

export function classifyRadarSignal(input: RadarClassificationInput): RadarClassification {
  const cleanText = cleanSignalText(input.text);
  const rule = chooseRule(cleanText);
  const summary = truncateSentence(cleanText || input.text.trim(), 220);

  return {
    category: rule.category,
    title: truncateSentence(summary, 92),
    summary,
    whyBuildersCare: rule.whyBuildersCare,
    testPrompt: rule.testPrompt,
    score: signalScore(input.metrics),
    tags: matchedTags(cleanText, rule),
  };
}
