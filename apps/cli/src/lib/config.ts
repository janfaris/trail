// Local Trail config at ~/.trail/config.json.
//
// Used by the daemon's auto-upload loop. Default state is OFF — auto-upload
// only flips on if the user explicitly opts in (via the post-login prompt
// or `trail config set autoUpload true`). Never set silently from
// `npm install` or any other unattended path.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const TRAIL_DIR = path.join(homedir(), ".trail");
const CONFIG_PATH = path.join(TRAIL_DIR, "config.json");

export interface TrailConfig {
  /**
   * When true, the daemon will attempt to upload newly-ingested sessions
   * to gettrail.vercel.app once their linked commit is reachable from
   * `origin/main` (or the repo's default branch). Same redact + entropy
   * guard pipeline as `trail share`.
   */
  autoUpload: boolean;
}

const DEFAULTS: TrailConfig = {
  autoUpload: false,
};

const VALID_KEYS = new Set<keyof TrailConfig>(["autoUpload"]);

function ensureDir(): void {
  if (!existsSync(TRAIL_DIR)) mkdirSync(TRAIL_DIR, { recursive: true });
}

export function loadConfig(): TrailConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<TrailConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    // Corrupt config = fall back to defaults. We deliberately don't crash
    // the daemon over a malformed user-edited config.json.
    return { ...DEFAULTS };
  }
}

export function saveConfig(cfg: TrailConfig): void {
  ensureDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function setConfigValue<K extends keyof TrailConfig>(
  key: K,
  value: TrailConfig[K],
): TrailConfig {
  const cfg = loadConfig();
  cfg[key] = value;
  saveConfig(cfg);
  return cfg;
}

export function isValidKey(key: string): key is keyof TrailConfig {
  return VALID_KEYS.has(key as keyof TrailConfig);
}

/**
 * Parse a CLI-supplied string value into the typed config value. Today
 * everything is boolean; this widens easily when we add string / number
 * options.
 */
export function parseConfigValue(key: keyof TrailConfig, raw: string): boolean {
  if (key === "autoUpload") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes" || v === "y" || v === "on") return true;
    if (v === "false" || v === "0" || v === "no" || v === "n" || v === "off") return false;
    throw new Error(`Invalid boolean value for ${key}: ${raw}`);
  }
  throw new Error(`Unknown config key: ${key}`);
}
