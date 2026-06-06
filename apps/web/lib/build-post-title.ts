// Derive a short build-post title from the summary/take: first non-empty line,
// first sentence, markdown bullets/numbering stripped, capped at 120 chars.
// Kept separate from lib/derive-title.ts (which derives titles from prompts with
// a fallback slug) so the two title heuristics can't be confused.
export function deriveBuildPostTitle(summary: string): string {
  const firstLine =
    summary
      .split(/\n+/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const firstSentence = firstLine.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? firstLine;
  return firstSentence
    .replace(/^[-*#\d.)\s]+/, "")
    .slice(0, 120)
    .trim();
}
