import { Command } from "commander";
import chalk from "chalk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { userInfo } from "node:os";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { buildPlist } from "../lib/launchd-plist.js";
import {
  DAEMON_LABEL,
  TRAIL_DIR,
  LOG_PATH,
  LAUNCH_AGENTS_DIR,
  PLIST_PATH,
} from "../lib/daemon-paths.js";

const execFileP = promisify(execFile);

export { DAEMON_LABEL, TRAIL_DIR, LOG_PATH, LAUNCH_AGENTS_DIR, PLIST_PATH };

export type DaemonStatus =
  | { state: "running"; pid: number }
  | { state: "installed" }
  | { state: "not-installed" };

type Runner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultRunner: Runner = (cmd, args) => execFileP(cmd, args);

export class DaemonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaemonError";
  }
}

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
    throw new DaemonError("Daemon mode is macOS-only");
  }
}

async function resolveProgramArgs(): Promise<{
  binPath: string;
  extraArgs: string[];
}> {
  // We bind launchd to Node directly instead of going through the `trail`
  // shim. The shim is a CommonJS wrapper that re-execs Node via shebang
  // (`#!/usr/bin/env node`) — but launchd user agents don't inherit a
  // login shell PATH, so `env node` can't find Node and the daemon
  // restart-loops with exit 127.
  //
  // process.execPath is set when the user runs `trail login` (which loaded
  // Node to interpret the CLI), so it's a reliable absolute path to the
  // exact Node binary that just worked. We re-use the resolved
  // dist/index.js path computed by the launcher (bin/trail.cjs) — the
  // same module being interpreted right now.
  const nodePath = process.execPath;
  // Resolve the bundled CLI entry. Two cases:
  //   1) Invoked from the installed npm tree: import.meta.url is dist/index.js
  //      itself (because tsup bundles auth.ts into dist/index.js). Use that.
  //   2) Invoked from a dev tsx run: src/commands/daemon.ts. We can't bundle
  //      that under launchd, so fall back to `which trail` + ["record"].
  const url = import.meta.url;
  if (url.includes("/dist/index.js")) {
    const indexPath = new URL(url).pathname;
    return { binPath: nodePath, extraArgs: [indexPath, "record"] };
  }
  // Dev / fallback path: try to find the trail binary via PATH.
  try {
    const { stdout } = await execFileP("which", ["trail"]);
    const p = stdout.trim();
    if (p) return { binPath: p, extraArgs: ["record"] };
  } catch {
    // fall through
  }
  throw new DaemonError(
    "Could not locate the trail CLI bundle. Reinstall via `npm install -g @gettrail/cli` and rerun `trail daemon install`.",
  );
}

async function bootstrap(): Promise<void> {
  const uid = userInfo().uid;
  await execFileP("launchctl", ["bootstrap", `gui/${uid}`, PLIST_PATH]);
}

interface ExecError extends Error {
  code?: number | string;
  stderr?: string;
}

function isMissingServiceError(err: unknown): boolean {
  const e = err as ExecError;
  const code = typeof e?.code === "number" ? e.code : Number.parseInt(String(e?.code ?? ""), 10);
  if (code === 113 || code === 3) return true;
  const stderr = String(e?.stderr ?? "");
  return /could not find service|no such process|not loaded/i.test(stderr);
}

async function bootout(ignoreMissing: boolean): Promise<void> {
  const uid = userInfo().uid;
  try {
    await execFileP("launchctl", ["bootout", `gui/${uid}/${DAEMON_LABEL}`]);
  } catch (err) {
    if (ignoreMissing && isMissingServiceError(err)) return;
    throw err;
  }
}

async function installAction(): Promise<void> {
  assertMac();
  await mkdir(TRAIL_DIR, { recursive: true });
  await mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
  const { binPath, extraArgs } = await resolveProgramArgs();
  const plist = buildPlist({
    binPath,
    extraArgs,
    logPath: LOG_PATH,
    label: DAEMON_LABEL,
  });
  await writeFile(PLIST_PATH, plist, "utf8");
  await bootstrap();
  console.log(
    chalk.green(
      `Installed ${DAEMON_LABEL} (program: ${binPath}${extraArgs.length ? " " + extraArgs.join(" ") : ""})`,
    ),
  );
}

async function uninstallAction(): Promise<void> {
  assertMac();
  await bootout(true);
  try {
    await unlink(PLIST_PATH);
  } catch {
    // already gone
  }
  console.log(chalk.green(`Uninstalled ${DAEMON_LABEL}`));
}

async function restartAction(): Promise<void> {
  assertMac();
  await bootout(true);
  await bootstrap();
  console.log(chalk.green(`Restarted ${DAEMON_LABEL}`));
}

async function statusAction(): Promise<void> {
  assertMac();
  const s = await getDaemonStatus();
  console.log(formatStatus(s));
}

function wrap(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(msg));
      process.exit(1);
    }
  };
}

export function daemonCommand(): Command {
  const cmd = new Command("daemon").description("Manage the Trail background recorder (macOS)");
  cmd.command("status").description("Show daemon status").action(wrap(statusAction));
  cmd.command("install").description("Install and start the daemon").action(wrap(installAction));
  cmd.command("uninstall").description("Stop and remove the daemon").action(wrap(uninstallAction));
  cmd.command("restart").description("Restart the daemon").action(wrap(restartAction));
  return cmd;
}

// Re-export the install action so `trail login` can call it directly after
// a successful sign-in. Uses the same `wrap` helper for friendly error
// formatting (DaemonError -> red ✗ message, anything else -> stack).
export const daemonInstallAction = wrap(installAction);
