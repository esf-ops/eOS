import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/**
 * Local-only review harness. Not used by production `npm run build`.
 * Run: npx vite --config vite.review.config.ts --port 5199
 */
export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: false,
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [repoRoot] },
    // Same-origin proxy so Playwright/Chromium can capture Takeoff iframe pixels
    // (cross-origin iframes render blank in page screenshots under site isolation).
    proxy: {
      "/__takeoff": {
        target: "http://127.0.0.1:5186",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__takeoff/, "") || "/",
        ws: true
      }
    }
  },
  resolve: {
    alias: {
      "@takeoff-core": path.resolve(repoRoot, "backend-core/src/takeoff"),
      "@backend-elite100": path.resolve(repoRoot, "backend-core/src/elite100EstimateStudio")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist-review"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "review-estimate-record.html")
    }
  }
});
