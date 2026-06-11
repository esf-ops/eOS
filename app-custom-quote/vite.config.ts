import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5187,
    fs: { allow: [repoRoot] }
  },
  resolve: {
    alias: {
      "@quote-lib": path.resolve(repoRoot, "app-quote/src/lib"),
      "@quote-ui": path.resolve(repoRoot, "app-quote/src/ui")
    }
  }
});
