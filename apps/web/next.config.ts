import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trail/schema", "@trail/anonymize", "@trail/client"],
};

export default nextConfig;
