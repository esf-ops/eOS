import { execSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function readBackendConnectOrigin(mode: string): string {
  const env = loadEnv(mode, process.cwd(), "");
  const raw = String(env.VITE_BACKEND_URL || "https://api.eliteosfab.com").trim();
  if (!raw) return "https://api.eliteosfab.com";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://api.eliteosfab.com";
  }
}

function resolveBuildMarker(): string {
  const fromEnv =
    String(
      process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_DEPLOYMENT_ID ||
        process.env.VITE_DE_PUBLIC_BUILD_ID ||
        ""
    )
      .trim()
      .slice(0, 12);
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim().slice(0, 8);
  } catch {
    return "unknown";
  }
}

/**
 * Inject production-safe CSP + build marker into dist/index.html at build time.
 *
 * Production stylesheet is a same-origin <link> asset → style-src must include 'self'.
 * 'unsafe-inline' is intentionally omitted in production (no proven inline styles).
 * Vite dev injects <style> tags for HMR, so development keeps 'unsafe-inline'.
 */
function digitalEstimateHtmlPlugin(mode: string) {
  const backendOrigin = readBackendConnectOrigin(mode);
  const buildMarker = resolveBuildMarker();
  const isProd = mode === "production";
  const styleSrc = isProd ? "'self'" : "'self' 'unsafe-inline'";
  const connectSrc = `'self' ${backendOrigin} http://127.0.0.1:3001 http://localhost:3001`;
  const csp = [
    "default-src 'none'",
    `style-src ${styleSrc}`,
    "img-src 'self' data:",
    `connect-src ${connectSrc}`,
    "script-src 'self'",
    "font-src 'none'",
    "frame-ancestors 'none'"
  ].join("; ");

  return {
    name: "digital-estimate-html-csp",
    transformIndexHtml(html: string) {
      let out = html.replace(
        /http-equiv="Content-Security-Policy"\s+content="[^"]*"/,
        `http-equiv="Content-Security-Policy" content="${csp}"`
      );
      if (!out.includes('name="eliteos-de-build"')) {
        out = out.replace(
          "</head>",
          `    <meta name="eliteos-de-build" content="${buildMarker}" />\n  </head>`
        );
      } else {
        out = out.replace(
          /name="eliteos-de-build" content="[^"]*"/,
          `name="eliteos-de-build" content="${buildMarker}"`
        );
      }
      return out;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), react(), digitalEstimateHtmlPlugin(mode)],
  server: {
    port: 5195,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
}));
