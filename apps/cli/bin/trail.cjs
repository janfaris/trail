#!/usr/bin/env node
// Tiny launcher. Node's `node:sqlite` module is stable from v22 but still
// emits an `ExperimentalWarning` on every import. We can't suppress it
// from inside the bundled CLI (the warning fires during module-graph
// construction, before any user code runs). The portable, no-rebuild
// solution: re-exec Node with --no-warnings=ExperimentalWarning here,
// then load the real entry. ~10ms cost at startup, clean stderr for users.
//
// Plain CommonJS so `require` works without ESM ceremony. Safe across
// every Node 22+ runtime.

"use strict";

// Sentinel: don't re-fork if we already re-execed.
if (!process.env._TRAIL_NO_RE_EXEC) {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const indexPath = path.join(__dirname, "..", "dist", "index.js");
  const result = spawnSync(
    process.execPath,
    ["--no-warnings=ExperimentalWarning", indexPath, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, _TRAIL_NO_RE_EXEC: "1" },
    },
  );
  process.exit(result.status === null ? 1 : result.status);
}

// If somehow re-entered (sentinel set but launcher reran), bail.
process.exit(1);
