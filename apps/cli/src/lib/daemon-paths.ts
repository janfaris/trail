import { homedir } from "node:os";
import path from "node:path";

export const RECORD_SUBCOMMAND = "record";
export const DAEMON_LABEL = "com.trail.daemon";
export const TRAIL_DIR = path.join(homedir(), ".trail");
export const LOG_PATH = path.join(TRAIL_DIR, "daemon.log");
export const LAUNCH_AGENTS_DIR = path.join(homedir(), "Library", "LaunchAgents");
export const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${DAEMON_LABEL}.plist`);
