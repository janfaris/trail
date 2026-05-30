import { defineConfig } from "vitest/config";

// Scoped to the pure, DB-free helpers under lib/. Keeping the include list
// narrow stops vitest from trying to load Next.js route modules (which touch
// the DB/env at import time and would hang or fail without a server runtime).
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // receipt-image.test.ts drives the @vercel/og (satori) PNG renderer, which
    // needs a native font/layout runtime and is environment-fragile under a
    // plain node vitest run. Keep it out of the unit pass; it predates this
    // config and is unrelated to the lib logic these tests cover.
    exclude: ["lib/receipt-image.test.ts", "**/node_modules/**"],
  },
});
