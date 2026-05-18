/**
 * Derive a clean, human-readable title from a session's first prompt.
 *
 * Heuristics, in order:
 *   1. Take the first non-empty line (most prompts lead with the actual question)
 *   2. Strip terminal/shell output noise that often gets pasted in
 *   3. Stop at the first sentence terminator (?, ., !) if it produces a usable title
 *   4. Trim to maxLen with ellipsis on word boundary
 *
 * Fallbacks: explicit title > summary first-line > slug
 */
const MAX_LEN = 80;

// Lines starting with these prefixes are shell output, not part of the question
const SHELL_NOISE_PREFIXES = [
  "$",
  ">",
  "✓",
  "✗",
  "→",
  "—",
  "ERROR",
  "Warning",
  "warning:",
  "error:",
  "info:",
];

// Strip inline shell suffixes that often get accidentally pasted onto
// the end of a question line, before we decide if a line is "shell output".
function stripInlineShellSuffix(line: string): string {
  return line
    .replace(/\s+[0-9a-f]{6,}\.\.[0-9a-f]{6,}.*$/, "")
    .replace(/\s+->\s*(main|master|HEAD)\b.*$/, "")
    .replace(/\s+[\w.-]+@[\w.-]+\s*[:%$#].*$/, "")
    .trim();
}

function looksLikeShellOutput(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (SHELL_NOISE_PREFIXES.some((p) => trimmed.startsWith(p))) return true;
  // Lines that ARE just a commit range or branch ref
  if (/^[0-9a-f]{6,}\.\.[0-9a-f]{6,}\s*(main|master|HEAD|->)/.test(trimmed)) return true;
  // Pure shell prompt lines
  if (/^[\w.-]+@[\w.-]+\s*[:%$#]/.test(trimmed)) return true;
  return false;
}

function trimToWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // Only fall back to hard-cut if there's no reasonable space within the window
  const sliced = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${sliced.trimEnd()}…`;
}

export function deriveTitle(
  firstPromptText: string | null | undefined,
  fallback: string,
): string {
  if (!firstPromptText) return fallback;

  // Strip inline noise BEFORE filtering, so "how do I X?  abc..def main -> main"
  // gets cleaned to "how do I X?" first, then the filter keeps it.
  const lines = firstPromptText
    .split(/\r?\n/)
    .map((l) => stripInlineShellSuffix(l.trim()))
    .filter((l) => l && !looksLikeShellOutput(l));

  const firstClean = lines[0];
  if (!firstClean) return fallback;

  // Prefer the first sentence if it's long enough to be useful
  const sentenceMatch = firstClean.match(/^([^?.!]+[?.!])/);
  const candidate = sentenceMatch?.[1] ?? firstClean;

  // Remove trailing terminator for cleaner display unless it's a question mark
  const cleaned = candidate.replace(/[.!]+$/, "").trim();
  if (cleaned.length < 4) return trimToWordBoundary(firstClean, MAX_LEN);

  return trimToWordBoundary(cleaned, MAX_LEN);
}
