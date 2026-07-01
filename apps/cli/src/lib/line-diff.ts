export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

export interface LineDiff {
  added: number;
  removed: number;
  lines: DiffLine[];
  /** True when the inputs were too large for an exact LCS and we fell back. */
  truncated: boolean;
}

// LCS is O(n*m) in time and memory. Beyond this many cells we stop computing an
// exact diff (full file contents can be huge) and report a coarse all-removed
// then all-added result, which still yields sensible +/- counts.
const MAX_CELLS = 2_000_000;

function splitLines(s: string): string[] {
  if (s.length === 0) return [];
  return s.split("\n");
}

/**
 * Compute a line-level diff between two blobs using a longest-common-subsequence
 * walk. Pure and dependency-free so it can back both the `±path (+A −D)` summary
 * in the timeline and the per-event unified view. Returns added/removed counts
 * plus the ordered diff lines.
 */
export function lineDiff(before: string, after: string): LineDiff {
  const a = splitLines(before);
  const b = splitLines(after);

  if (a.length * b.length > MAX_CELLS) {
    const lines: DiffLine[] = [
      ...a.map((text) => ({ type: "del" as const, text })),
      ...b.map((text) => ({ type: "add" as const, text })),
    ];
    return { added: b.length, removed: a.length, lines, truncated: true };
  }

  const m = a.length;
  const n = b.length;
  const width = n + 1;
  // dp[i * width + j] = LCS length of a[i..] and b[j..]. A flat Int32Array keeps
  // index access typed as `number` (not possibly-undefined) and is cheaper than
  // a nested array.
  const dp = new Int32Array((m + 1) * width);
  for (let i = m - 1; i >= 0; i--) {
    const ai = a[i] as string;
    for (let j = n - 1; j >= 0; j--) {
      dp[i * width + j] =
        ai === b[j]
          ? dp[(i + 1) * width + (j + 1)] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)]);
    }
  }

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    const ai = a[i] as string;
    const bj = b[j] as string;
    if (ai === bj) {
      lines.push({ type: "ctx", text: ai });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      lines.push({ type: "del", text: ai });
      removed++;
      i++;
    } else {
      lines.push({ type: "add", text: bj });
      added++;
      j++;
    }
  }
  while (i < m) {
    lines.push({ type: "del", text: a[i] as string });
    removed++;
    i++;
  }
  while (j < n) {
    lines.push({ type: "add", text: b[j] as string });
    added++;
    j++;
  }

  return { added, removed, lines, truncated: false };
}
