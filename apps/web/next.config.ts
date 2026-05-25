import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trail/schema", "@trail/anonymize", "@trail/client"],
  // skia-canvas is a native (.node) addon — exclude from bundling so it's
  // required at runtime from node_modules instead of traced into the chunk.
  serverExternalPackages: ["skia-canvas"],
};

export default nextConfig;
