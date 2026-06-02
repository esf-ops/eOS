import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5186,
    fs: { allow: [repoRoot] }
  },
  resolve: {
    alias: {
      // Import the pure backend takeoff contract modules directly.
      // These are plain ESM (no Node.js builtins) and vite can bundle them.
      // fs.allow: [repoRoot] permits cross-workspace file access during dev.
      "@takeoff-core": path.resolve(repoRoot, "backend-core/src/takeoff"),
      // Shared auth helpers (used by multiple heads).
      "@shared": path.resolve(repoRoot, "shared"),
    }
  }
});
