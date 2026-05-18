import { Command } from "commander";
import chalk from "chalk";
import chokidar from "chokidar";
import { homedir } from "node:os";
import path from "node:path";
import { userInfo } from "node:os";
import { parseClaudeCodeSession, parseCodexSession } from "@trail/parsers";
import { saveSession } from "../db.js";

export function recordCommand(): Command {
  return new Command("record")
    .description("Watch tool log directories and ingest sessions into local DB")
    .option("--once", "scan once and exit instead of watching")
    .action(async (opts: { once?: boolean }) => {
      const user = userInfo().username;
      const claudeDir = path.join(homedir(), ".claude", "projects");
      const codexDir = path.join(homedir(), ".codex", "sessions");
      console.log(chalk.cyan("trail record"), "→ watching", claudeDir, "+", codexDir);

      const ingest = async (filePath: string) => {
        if (!filePath.endsWith(".jsonl")) return;
        try {
          const isCodex = filePath.includes(`${path.sep}.codex${path.sep}`);
          const session = isCodex
            ? await parseCodexSession(filePath, user)
            : await parseClaudeCodeSession(filePath, user);
          if (session.events.length === 0) return;
          saveSession(session, filePath);
          console.log(
            chalk.green("ingested"),
            session.id,
            chalk.dim(`(${session.tool}, ${session.events.length} events)`),
          );
        } catch (err) {
          console.error(chalk.red("error"), filePath, (err as Error).message);
        }
      };

      const watcher = chokidar.watch([claudeDir, codexDir], {
        ignored: (p) => p.includes("/node_modules/"),
        persistent: !opts.once,
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });

      watcher.on("add", ingest).on("change", ingest);

      if (opts.once) {
        await new Promise<void>((resolve) => watcher.on("ready", () => resolve()));
        await watcher.close();
      }
    });
}
