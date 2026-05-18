import { Command } from "commander";
import chalk from "chalk";
import open from "open";
import { runLoginFlow } from "../lib/auth-flow.js";
import { clearAuth, loadAuth } from "../lib/auth-storage.js";
import { DEFAULT_TRAIL_API_URL } from "@trail/client";

export function loginCommand(): Command {
  return new Command("login")
    .description("Authorize the Trail CLI by signing in via your browser")
    .option("--base-url <url>", "Trail web base URL", process.env.TRAIL_API_URL || DEFAULT_TRAIL_API_URL)
    .action(async (opts: { baseUrl: string }) => {
      try {
        const result = await runLoginFlow({
          baseUrl: opts.baseUrl,
          openBrowser: (url) => open(url),
        });
        console.log(chalk.green("✓"), `Logged in as @${result.userHandle}`);
      } catch (e) {
        console.error(chalk.red("✗"), (e as Error).message);
        process.exit(1);
      }
    });
}

export function logoutCommand(): Command {
  return new Command("logout")
    .description("Forget the saved Trail CLI credentials")
    .action(() => {
      const removed = clearAuth();
      console.log(removed ? chalk.green("✓ logged out") : chalk.yellow("not logged in"));
    });
}

export function whoamiCommand(): Command {
  return new Command("whoami")
    .description("Print the currently logged-in handle")
    .action(() => {
      const rec = loadAuth();
      if (!rec) {
        console.log(chalk.yellow("not logged in"));
        process.exit(1);
      } else {
        console.log(`@${rec.userHandle}`);
      }
    });
}
