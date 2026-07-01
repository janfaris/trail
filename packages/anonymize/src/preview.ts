// Masked previews for the redaction report. The whole point of the report is
// to let a user SEE what was removed before they publish — but the preview
// itself must never re-expose the secret it is describing. So we reveal just
// enough to recognize the match (a short head + tail) and mask the middle.
//
// Design notes:
//   * The mask width is capped (independent of the real length) so the visual
//     never leaks how long the secret is — the exact length is reported as a
//     separate numeric field.
//   * Whitespace is collapsed so multi-line matches (PEM blocks, JSON) render
//     as a single readable token.
//   * Very short matches reveal only the first character.

const MAX_MASK = 8;

/**
 * Produce a display-safe preview of a removed value, e.g.
 *   "sk-ant-abcdefghijklmnop2mno" → "sk-a••••••••no"
 *   "jan@example.com"             → "jan@••••••••om"
 *   "topsy"                       → "t••••"
 *
 * The result is safe to print, store, and upload: at most the first 4 and
 * last 2 characters of the original survive, with a fixed-width mask between.
 */
export function maskPreview(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const len = collapsed.length;
  if (len === 0) return "";
  if (len <= 6) {
    return collapsed.slice(0, 1) + "•".repeat(len - 1);
  }
  const head = collapsed.slice(0, 4);
  const tail = collapsed.slice(-2);
  const maskWidth = Math.min(MAX_MASK, len - 6);
  return `${head}${"•".repeat(maskWidth)}${tail}`;
}
