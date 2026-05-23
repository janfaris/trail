import { Command } from "commander";
import chalk from "chalk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);

export const DAEMON_LABEL = "com.trail.daemon";
export const TRAIL_DIR = path.join(homedir(), ".trail");
export const LOG_PATH = path.join(TRAIL_DIR, "daemon.log");
export const LAUNCH_AGENTS_DIR = path.join(homedir(), "Library", "LaunchAgents");
export const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${DAEMON_LABEL}.plist`);

export type DaemonStatus =
  | { state: "running"; pid: number }
  | { state: "installed" }
  | { state: "not-installed" };

type Runner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultRunner: Runner = (cmd, args) => execFileP(cmd, args);

export async function getDaemonStatus(runner: Runner = defaultRunner): Promise<DaemonStatus> {
  try {
    const { stdout } = await runner("launchctl", ["list", DAEMON_LABEL]);
    const pidMatch = stdout.match(/"PID"\s*=\s*(\d+)/);
    if (pidMatch && pidMatch[1]) {
      return { state: "running", pid: Number.parseInt(pidMatch[1], 10) };
    }
    return { state: "installed" };
  } catch {
    return { state: "not-installed" };
  }
}

export function formatStatus(s: DaemonStatus): string {
  if (s.state === "running") return `running (pid ${s.pid})`;
  if (s.state === "installed") return "installed but not running";
  return "not installed";
}

function assertMac(): void {
  if (process.platform !== "darwin") {
    console.error(chalk.red("Daemon mode is macOS-only"));
    process.exit(1);
  }
}

async function statusAction(): Promise<void> {
  assertMac();
  const s = await getDaemonStatus();
  console.log(formatStatus(s));
}

export function daemonCommand(): Command {
  const cmd = new Command("daemon").description("Manage the Trail background recorder (macOS)");
  cmd.command("status").description("Show daemon status").action(statusAction);
  return cmd;
}
