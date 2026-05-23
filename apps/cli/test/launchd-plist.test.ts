import { describe, it, expect } from "vitest";
import { buildPlist } from "../src/lib/launchd-plist.js";

describe("buildPlist", () => {
  const xml = buildPlist({
    binPath: "/usr/local/bin/trail",
    logPath: "/Users/x/.trail/daemon.log",
    label: "com.trail.daemon",
  });

  it("includes required keys", () => {
    expect(xml).toContain("<key>Label</key>");
    expect(xml).toContain("<string>com.trail.daemon</string>");
    expect(xml).toContain("<key>ProgramArguments</key>");
    expect(xml).toContain("<string>/usr/local/bin/trail</string>");
    expect(xml).toContain("<string>record</string>");
    expect(xml).toContain("<key>RunAtLoad</key>");
    expect(xml).toContain("<key>KeepAlive</key>");
    expect(xml).toContain("<key>StandardOutPath</key>");
    expect(xml).toContain("<key>StandardErrorPath</key>");
    expect(xml).toContain("<string>/Users/x/.trail/daemon.log</string>");
  });

  it("is well-formed XML plist", () => {
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<plist version=\"1.0\">");
    expect(xml.trimEnd().endsWith("</plist>")).toBe(true);
  });
});
