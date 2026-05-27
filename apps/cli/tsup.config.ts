import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // node:sqlite is stable from Node 22. We use the synchronous DatabaseSync
  // API; Node 22+ is also where the experimental warning was downgraded.
  target: "node22",
  platform: "node",
  clean: true,
  shims: false,
  splitting: false,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: ["@trail/parsers", "@trail/schema", "@trail/anonymize", "@trail/client"],
  // esbuild has a long-standing quirk: marking a `node:*` builtin as `external`
  // strips the `node:` prefix in the emitted output (it treats the prefix as
  // a hint, not a stable wire identifier). For `node:sqlite` specifically
  // that breaks at runtime — bare `from "sqlite"` resolves to the *npm*
  // `sqlite` package (which we don't depend on), not Node's builtin.
  //
  // The `onSuccess` hook below rewrites bare `from "sqlite"` back to
  // `from "node:sqlite"` after the bundle is written. Only the bare
  // specifier comes from our `node:sqlite` import (we have no npm `sqlite`
  // dep), so the substitution is unambiguous.
  onSuccess: async () => {
    const fs = await import("node:fs");
    const path = "dist/index.js";
    const src = fs.readFileSync(path, "utf8");
    // Rewrite both ESM and CJS forms. We emit ESM only, but harmless to
    // cover both in case the format changes.
    const fixed = src
      .replace(/from\s+"sqlite"/g, 'from "node:sqlite"')
      .replace(/require\("sqlite"\)/g, 'require("node:sqlite")');
    if (fixed !== src) {
      fs.writeFileSync(path, fixed);
      console.log("✓ rewrote sqlite -> node:sqlite in dist/index.js");
    }
  },
});
