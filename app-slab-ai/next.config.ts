import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@eliteos-ui/EliteosTopbar": path.join(repoRoot, "shared/eliteos-ui/EliteosTopbar.tsx"),
    };
    return config;
  },
};

export default nextConfig;
