import { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "node:readline";
import { db, transaction } from "../db.js";

interface Match {
  id: string;
  startedAt: string;
  tool: string;
}

function resolvePrefix(prefix: string): Match[] {
  // Exact match wins; otherwise prefix match (`trail list` shows 12-char,
  // `trail share` accepts short ids — same shape here).
  const exact = db
    .prepare(`SELECT id, started_at AS startedAt, tool FROM sessions WHERE id = ?`)
    .get(prefix) as Match | undefined;
  if (exact) return [exact];
  return db
    .prepare(
      `SELECT id, started_at AS startedAt, tool FROM sessions WHERE id LIKE ? ORDER BY started_at DESC`,
    )
    .all(`${prefix}%`) as Match[];
}

function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

interface Resolution {
  matched: Match[];
  unknown: string[];
  ambiguous: Array<{ prefix: string; candidates: string[] }>;
}

export function resolvePrefixes(prefixes: string[]): Resolution {
  const seen = new Set<string>();
  const matched: Match[] = [];
  const unknown: string[] = [];
  const ambiguous: Array<{ prefix: string; candidates: string[] }> = [];
  for (const p of prefixes) {
    const hits = resolvePrefix(p);
    if (hits.length === 0) {
      unknown.push(p);
      continue;
    }
    if (hits.length > 1 && hits[0]!.id !== p) {
      ambiguous.push({ prefix: p, candidates: hits.map((h) => h.id) });
      continue;
    }
    for (const h of hits) {
      if (!seen.has(h.id)) {
        seen.add(h.id);
        matched.push(h);
      }
    }
  }
  return { matched, unknown, ambiguous };
}

export function deleteSessionIds(ids: string[]): number {
  if (ids.length === 0) return 0;
  // SQLite has foreign_keys OFF by default in this DB, so we delete from
  // events + events_fts explicitly rather than relying on ON DELETE CASCADE.
  const placeholders = ids.map(() => "?").join(",");
  const delEvents = db.prepare(`DELETE FROM events WHERE session_id IN (${placeholders})`);
  const delFts = db.prepare(`DELETE FROM events_fts WHERE session_id IN (${placeholders})`);
  const delSess = db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`);
  let deleted = 0;
  transaction(() => {
    delEvents.run(...ids);
    delFts.run(...ids);
    const r = delSess.run(...ids);
    deleted = Number(r.changes ?? 0);
  });
  return deleted;
}

export function deleteCommand(): Command {
  return new Command("delete")
    .description("Delete local recorded sessions by id (or short prefix)")
    .argument("<ids...>", "one or more session ids / 8-char prefixes")
    .option("--yes", "skip confirmation prompt", false)
    .option("--json", "output JSON (implies --yes for scripting)", false)
    .action(async (ids: string[], opts: { yes: boolean; json: boolean }) => {
      const { matched, unknown, ambiguous } = resolvePrefixes(ids);

      if (opts.json) {
        const deleted = deleteSessionIds(matched.map((m) => m.id));
        console.log(
          JSON.stringify(
            {
              deleted,
              ids: matched.map((m) => m.id),
              unknown,
              ambiguous,
            },
            null,
            2,
          ),
        );
        if (unknown.length > 0 || ambiguous.length > 0) process.exit(1);
        return;
      }

      for (const u of unknown) {
        console.error(chalk.red("✗"), `no session matches "${u}"`);
      }
      for (const a of ambiguous) {
        console.error(
          chalk.red("✗"),
          `prefix "${a.prefix}" is ambiguous (${a.candidates.length} matches): ${a.candidates
            .map((c) => c.slice(0, 12))
            .join(", ")}`,
        );
      }
      if (unknown.length > 0 || ambiguous.length > 0) {
        process.exit(1);
      }
      if (matched.length === 0) {
        console.log(chalk.yellow("nothing to delete"));
        return;
      }

      console.log(
        chalk.cyan("delete"),
        `${matched.length} session(s):`,
      );
      const sample = matched.slice(0, 5);
      for (const m of sample) {
        console.log(
          "  ",
          chalk.cyan(m.id.slice(0, 12)),
          chalk.dim(m.startedAt),
          chalk.magenta(m.tool),
        );
      }
      if (matched.length > sample.length) {
        console.log(chalk.dim(`  … and ${matched.length - sample.length} more`));
      }

      if (!opts.yes) {
        const ok = await confirm(`Delete ${matched.length} session(s)? This cannot be undone.`);
        if (!ok) {
          console.log(chalk.yellow("aborted"));
          return;
        }
      }

      const deleted = deleteSessionIds(matched.map((m) => m.id));
      console.log(chalk.green("✓"), `deleted ${deleted} session(s)`);
    });
}
