const { neon } = require("@neondatabase/serverless");

const SHELL_NOISE_PREFIXES = ["$", ">", "✓", "✗", "→", "—", "ERROR", "Warning", "warning:", "error:", "info:"];

function stripInlineShellSuffix(line) {
  return line
    .replace(/\s+[0-9a-f]{6,}\.\.[0-9a-f]{6,}.*$/, "")
    .replace(/\s+->\s*(main|master|HEAD)\b.*$/, "")
    .replace(/\s+[\w.-]+@[\w.-]+\s*[:%$#].*$/, "")
    .trim();
}

function looksLikeShellOutput(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (SHELL_NOISE_PREFIXES.some((p) => trimmed.startsWith(p))) return true;
  if (/^[0-9a-f]{6,}\.\.[0-9a-f]{6,}\s*(main|master|HEAD|->)/.test(trimmed)) return true;
  if (/^[\w.-]+@[\w.-]+\s*[:%$#]/.test(trimmed)) return true;
  return false;
}

function trimToWordBoundary(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const sliced = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return sliced.trimEnd() + "…";
}

function deriveTitle(firstPromptText, fallback) {
  if (!firstPromptText) return fallback;
  const lines = firstPromptText
    .split(/\r?\n/)
    .map((l) => stripInlineShellSuffix(l.trim()))
    .filter((l) => l && !looksLikeShellOutput(l));
  const firstClean = lines[0];
  if (!firstClean) return fallback;
  const sentenceMatch = firstClean.match(/^([^?.!]+[?.!])/);
  const candidate = sentenceMatch ? sentenceMatch[1] : firstClean;
  const cleaned = candidate.replace(/[.!]+$/, "").trim();
  if (cleaned.length < 4) return trimToWordBoundary(firstClean, 80);
  return trimToWordBoundary(cleaned, 80);
}

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT ts.id, ts.slug, ts.title, e.data
    FROM event e
    JOIN trail_session ts ON e.session_id = ts.id
    WHERE e.kind = 'prompt'
      AND e.idx = (
        SELECT MIN(idx) FROM event
        WHERE session_id = ts.id AND kind = 'prompt'
      )
  `;
  for (const r of rows) {
    const text = r.data && r.data.text;
    const newTitle = deriveTitle(text, r.slug);
    if (newTitle !== r.title) {
      await sql`UPDATE trail_session SET title = ${newTitle} WHERE id = ${r.id}`;
      console.log(`Updated ${r.slug}: ${JSON.stringify(r.title)} -> ${JSON.stringify(newTitle)}`);
    } else {
      console.log(`Unchanged ${r.slug}: ${JSON.stringify(r.title)}`);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
