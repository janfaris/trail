import { Command } from "commander";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { recordCommand } from "./commands/record.js";
import { viewCommand } from "./commands/view.js";
import { shareCommand } from "./commands/share.js";
import { openCommand } from "./commands/open.js";
import { searchCommand } from "./commands/search.js";
import { listCommand } from "./commands/list.js";
import { deleteCommand } from "./commands/delete.js";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/auth.js";
import { daemonCommand } from "./commands/daemon.js";
import { TRAIL_DIR } from "./lib/daemon-paths.js";
import { DB_PATH } from "./db.js";

const program = new Command()
  .name("trail")
  .description("Record and share your AI coding sessions")
  .version("0.2.1");

program.addCommand(recordCommand());
program.addCommand(viewCommand());
program.addCommand(shareCommand());
program.addCommand(openCommand());
program.addCommand(searchCommand());
program.addCommand(listCommand());
program.addCommand(deleteCommand());
program.addCommand(loginCommand());
program.addCommand(logoutCommand());
program.addCommand(whoamiCommand());
program.addCommand(daemonCommand());

function maybePrintFirstRunHint(): void {
  try {
    if (process.platform !== "darwin") return;
    const argv = process.argv.slice(2);
    if (argv[0] === "daemon" && argv[1] === "install") return;
    const hintMarker = path.join(TRAIL_DIR, ".hinted");
    if (existsSync(hintMarker)) return;
    if (existsSync(DB_PATH)) return;
    console.error(chalk.dim("Tip: run 'trail daemon install' to capture sessions automatically."));
    mkdirSync(TRAIL_DIR, { recursive: true });
    writeFileSync(hintMarker, "");
  } catch {
    // never crash the CLI on hint failures
  }
}

maybePrintFirstRunHint();
program.parseAsync();
