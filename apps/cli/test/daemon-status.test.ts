import { describe, it, expect } from "vitest";
import { getDaemonStatus, formatStatus } from "../src/commands/daemon.js";

describe("getDaemonStatus", () => {
  it("returns running with pid when launchctl reports PID", async () => {
    const runner = async () => ({
      stdout: `{
\t"LimitLoadToSessionType" = "Aqua";
\t"Label" = "com.trail.daemon";
\t"PID" = 4242;
};`,
      stderr: "",
    });
    const s = await getDaemonStatus(runner);
    expect(s).toEqual({ state: "running", pid: 4242 });
    expect(formatStatus(s)).toBe("running (pid 4242)");
  });

  it("returns installed when listed but no PID", async () => {
    const runner = async () => ({
      stdout: `{
\t"Label" = "com.trail.daemon";
};`,
      stderr: "",
    });
    const s = await getDaemonStatus(runner);
    expect(s).toEqual({ state: "installed" });
    expect(formatStatus(s)).toBe("installed but not running");
  });

  it("returns not-installed when launchctl exits non-zero", async () => {
    const runner = async () => {
      throw new Error("Could not find service");
    };
    const s = await getDaemonStatus(runner);
    expect(s).toEqual({ state: "not-installed" });
    expect(formatStatus(s)).toBe("not installed");
  });
});
