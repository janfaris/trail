import { Command } from "commander";
import chalk from "chalk";
import chokidar from "chokidar";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  parseClaudeCodeSession,
  parseCodexSession,
  parseHermesSession,
  parseCopilotCliSession,
  parseCopilotChatDB,
} from "@trail/parsers";
import { saveSession } from "../db.js";

const COPILOT_CHAT_DB = path.join(
  homedir(),
  "Library",
  "Application Support",
  "Code",
  "User",
  "globalStorage",
  "github.copilot-chat",
  "session-store.db",
);

const TRAIL_DIR = path.join(homedir(), ".trail");
const COPILOT_CHAT_CURSOR = path.join(TRAIL_DIR, "copilot-chat-cursor.json");

function readCopilotChatWatermark(): string | undefined {
  try {
    const raw = readFileSync(COPILOT_CHAT_CURSOR, "utf8");
    const o = JSON.parse(raw) as { since?: string };
    return o.since;
  } catch {
    return undefined;
  }
}

function writeCopilotChatWatermark(since: string): void {
  mkdirSync(TRAIL_DIR, { recursive: true });
  writeFileSync(COPILOT_CHAT_CURSOR, JSON.stringify({ since }, null, 2));
}

export function recordCommand(): Command {
  return new Command("record")
    .description("Watch tool log directories and ingest sessions into local DB")
    .option("--once", "scan once and exit instead of watching")
    .action(async (opts: { once?: boolean }) => {
      const user = userInfo().username;
      const home = homedir();
      const claudeDir = path.join(home, ".claude", "projects");
      const codexDir = path.join(home, ".codex", "sessions");
      const hermesDir = path.join(home, ".hermes", "sessions");
      const copilotCliDir = path.join(home, ".copilot", "session-state");
      console.log(
        chalk.cyan("trail record"),
        "→ watching",
        [claudeDir, codexDir, hermesDir, copilotCliDir].join(", "),
      );
      if (existsSync(COPILOT_CHAT_DB)) {
        console.log(chalk.cyan("trail record"), "→ polling", COPILOT_CHAT_DB);
      }

      const sep = path.sep;
      const ingest = async (filePath: string) => {
        try {
          let parsed;
          if (filePath.includes(`${sep}.hermes${sep}sessions${sep}`)) {
            if (!/session_.*\.json$/.test(filePath)) return;
            parsed = await parseHermesSession(filePath, user);
          } else if (
            filePath.includes(`${sep}.copilot${sep}session-state${sep}`)
          ) {
            if (!filePath.endsWith("events.jsonl")) return;
            parsed = await parseCopilotCliSession(filePath, user);
          } else if (filePath.includes(`${sep}.codex${sep}`)) {
            if (!filePath.endsWith(".jsonl")) return;
            parsed = await parseCodexSession(filePath, user);
          } else if (filePath.includes(`${sep}.claude${sep}`)) {
            if (!filePath.endsWith(".jsonl")) return;
            parsed = await parseClaudeCodeSession(filePath, user);
          } else {
            return;
          }
          if (parsed.events.length === 0) return;
          saveSession(parsed, filePath);
          console.log(
            chalk.green("ingested"),
            parsed.id,
            chalk.dim(`(${parsed.tool}, ${parsed.events.length} events)`),
          );
        } catch (err) {
          console.error(chalk.red("error"), filePath, (err as Error).message);
        }
      };

      const pollCopilotChat = () => {
        if (!existsSync(COPILOT_CHAT_DB)) return;
        try {
          const since = readCopilotChatWatermark();
          const sessions = parseCopilotChatDB(COPILOT_CHAT_DB, user, { since });
          let latest = since;
          for (const s of sessions) {
            if (s.events.length === 0) continue;
            saveSession(s, COPILOT_CHAT_DB);
            console.log(
              chalk.green("ingested"),
              s.id,
              chalk.dim(`(${s.tool}, ${s.events.length} events)`),
            );
            if (s.endedAt && (!latest || s.endedAt > latest)) latest = s.endedAt;
          }
          if (latest && latest !== since) writeCopilotChatWatermark(latest);
        } catch (err) {
          console.error(
            chalk.red("copilot-chat error"),
            (err as Error).message,
          );
        }
      };

      const watcher = chokidar.watch(
        [claudeDir, codexDir, hermesDir, copilotCliDir],
        {
          ignored: (p) => p.includes("/node_modules/"),
          persistent: !opts.once,
          ignoreInitial: false,
          awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
        },
      );

      watcher.on("add", ingest).on("change", ingest);

      if (opts.once) {
        await new Promise<void>((resolve) =>
          watcher.on("ready", () => resolve()),
        );
        pollCopilotChat();
        await watcher.close();
        return;
      }

      // Initial poll + interval for the copilot-chat sqlite db.
      pollCopilotChat();
      setInterval(pollCopilotChat, 30_000).unref();
    });
}
