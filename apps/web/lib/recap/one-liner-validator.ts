/**
 * Diagnostic validator for recap one-liners.
 *
 * Diagnostic-only — per house rule, quality lives in the prompt + tone spec,
 * never in post-LLM regex rewrites. This function reports warnings; the
 * route handler logs and persists them but does NOT mutate the LLM output.
 */

const BANNED_WORDS = [
  "leveraged",
  "utilized",
  "robust",
  "seamless",
  "cutting-edge",
  "powerful",
  "ecosystem",
  "synergies",
  "thrilled",
  "stoked",
  "harness the power",
  "in the age of ai",
  "ai-native",
  "vibe coded",
  "vibe-coded",
];

const BANNED_OPENINGS = [
  "i'm excited",
  "im excited",
  "i am excited",
  "excited to share",
  "happy to announce",
  "proud to announce",
];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export interface OneLinerValidation {
  warnings: string[];
}

export function validateOneLiner(text: string): OneLinerValidation {
  const warnings: string[] = [];
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.length === 0) {
    warnings.push("empty one-liner");
    return { warnings };
  }

  // Length sanity. Spec says 12-30 words; warn outside that band.
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 8) warnings.push(`too short (${wordCount} words)`);
  if (wordCount > 35) warnings.push(`too long (${wordCount} words)`);

  // Exactly one sentence. Count terminal punctuation that isn't followed by
  // a digit or another period (so "v2.0." and "etc." don't double-count).
  const terminals = (trimmed.match(/[.!?](?!\d)/g) ?? []).length;
  if (terminals > 1) warnings.push(`multi-sentence (${terminals} terminals)`);

  // Banned vocabulary
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) warnings.push(`banned word: "${word}"`);
  }
  for (const opening of BANNED_OPENINGS) {
    if (lower.startsWith(opening)) warnings.push(`banned opening: "${opening}"`);
  }

  // Emoji
  if (EMOJI_RE.test(trimmed)) warnings.push("contains emoji");

  // Exclamation
  if (trimmed.includes("!")) warnings.push("contains exclamation mark");

  // Hashtag
  if (/#\w/.test(trimmed)) warnings.push("contains hashtag");

  // Em-dash as performative pause (between letters, surrounded by spaces)
  if (/\s—\s/.test(trimmed)) warnings.push("contains em-dash pause");

  return { warnings };
}
