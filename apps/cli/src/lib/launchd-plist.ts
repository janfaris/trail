import { RECORD_SUBCOMMAND } from "./daemon-paths.js";

export interface BuildPlistInput {
  /**
   * Absolute path to the program launchd should exec. For the trail
   * daemon this should be Node.js's binary (process.execPath at install
   * time) — NOT the `trail` shim. The shim relies on `env node` finding
   * Node on PATH, which launchd doesn't honour for user agents.
   */
  binPath: string;
  /**
   * Extra arguments passed after binPath. When binPath is Node, this is
   * `[<dist/index.js>, "record"]`. When binPath is the `trail` shim
   * (legacy callers / tests), this is `["record"]`.
   */
  extraArgs?: string[];
  logPath: string;
  label: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildPlist({
  binPath,
  extraArgs,
  logPath,
  label,
}: BuildPlistInput): string {
  const bin = escapeXml(binPath);
  const log = escapeXml(logPath);
  const lbl = escapeXml(label);
  // Backward-compat: if no extraArgs supplied, default to ["record"] so
  // older callers and the launchd-plist unit tests keep their shape.
  const args = (extraArgs ?? [RECORD_SUBCOMMAND]).map(escapeXml);
  const argLines = args.map((a) => `    <string>${a}</string>`).join("\n");
  // Suppress the node:sqlite ExperimentalWarning at the program level so
  // the daemon log isn't polluted with one warning per startup.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${lbl}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
${argLines}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_NO_WARNINGS</key>
    <string>1</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
}

