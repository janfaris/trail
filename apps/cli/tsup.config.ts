import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  shims: false,
  splitting: false,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: ["@trail/parsers", "@trail/schema", "@trail/anonymize", "@trail/client"],
  external: ["better-sqlite3"],
});
