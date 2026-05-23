import { RECORD_SUBCOMMAND } from "./daemon-paths.js";

export interface BuildPlistInput {
  binPath: string;
  logPath: string;
  label: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildPlist({ binPath, logPath, label }: BuildPlistInput): string {
  const bin = escapeXml(binPath);
  const log = escapeXml(logPath);
  const lbl = escapeXml(label);
  const sub = escapeXml(RECORD_SUBCOMMAND);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${lbl}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
    <string>${sub}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
}
