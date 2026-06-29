import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "src/lib/customerEstimate/renderDocumentHtml.tsx"),
      formats: ["es"],
      fileName: () => "customerEstimateDocumentRender.mjs"
    },
    outDir: path.resolve(repoRoot, "backend-core/src/quoteDelivery/generated"),
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  },
  resolve: {
    alias: {
      "@quote-lib": path.resolve(__dirname, "src/lib")
    }
  }
});
