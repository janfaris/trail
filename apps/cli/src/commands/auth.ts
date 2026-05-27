import { Command } from "commander";
import chalk from "chalk";
import open from "open";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, platform } from "node:process";
import { runLoginFlow } from "../lib/auth-flow.js";
import { clearAuth, loadAuth } from "../lib/auth-storage.js";
import { DEFAULT_TRAIL_API_URL } from "@trail/client";

/**
 * After a successful login, offer to install + start the daemon if it
 * isn't already running. The daemon is what actually tails Claude Code +
 * Codex log files, so without it, the rest of the CLI does nothing.
 *
 * macOS only — that's where the launchctl plumbing lives today. On other
 * platforms we print a manual instruction instead of prompting.
 */
async function offerDaemonStart(): Promise<void> {
  if (platform !== "darwin") {
    console.log(
      chalk.gray(
        "Tip: run `trail record &` in your shell to start capturing sessions.",
      ),
    );
    return;
  }

  // Lazy-import daemon helpers so non-darwin invocations don't pull in
  // launchctl-dependent code paths.
  const { getDaemonStatus, daemonInstallAction } = await import(
    "./daemon.js"
  );

  let status;
  try {
    status = await getDaemonStatus();
  } catch {
    // launchctl missing or unreadable — print a manual hint and bail.
    console.log(
      chalk.gray("Tip: `trail daemon install` registers a launch agent."),
    );
    return;
  }

  if (status.kind === "running") {
    console.log(chalk.gray("Daemon already running — capture is active."));
    return;
  }

  // Non-interactive shells (CI, scripts piping into trail) shouldn't block
  // on a prompt — fall back to a hint and exit normally.
  if (!stdin.isTTY) {
    console.log(
      chalk.gray(
        "Tip: `trail daemon install` registers the launch agent so capture starts automatically on login.",
      ),
    );
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (
      await rl.question(
        chalk.cyan(
          "Start the background daemon now? (registers a launch agent so capture runs across reboots) [Y/n] ",
        ),
      )
    )
      .trim()
      .toLowerCase();
    if (answer === "" || answer === "y" || answer === "yes") {
      await daemonInstallAction();
    } else {
      console.log(
        chalk.gray(
          "Skipped. Run `trail daemon install` later, or `trail record &` for a foreground session.",
        ),
      );
    }
  } finally {
    rl.close();
  }
}

export function loginCommand(): Command {
  return new Command("login")
    .description("Authorize the Trail CLI by signing in via your browser")
    .option("--base-url <url>", "Trail web base URL", process.env.TRAIL_API_URL || DEFAULT_TRAIL_API_URL)
    .option("--no-daemon-prompt", "Skip the post-login prompt to start the daemon")
    .action(async (opts: { baseUrl: string; daemonPrompt: boolean }) => {
      try {
        const result = await runLoginFlow({
          baseUrl: opts.baseUrl,
          openBrowser: (url) => open(url),
        });
        console.log(chalk.green("✓"), `Logged in as @${result.userHandle}`);
        if (opts.daemonPrompt) {
          await offerDaemonStart();
        }
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
