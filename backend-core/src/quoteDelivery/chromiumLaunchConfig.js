/**
 * Chromium executable resolution for quote-delivery PDF rendering.
 * Serverless (Vercel/Lambda): @sparticuz/chromium. Local dev: env path or macOS Chrome.
 */

const MAC_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** @returns {boolean} */
export function isServerlessRuntime() {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.AWS_EXECUTION_ENV) ||
    Boolean(process.env.FUNCTIONS_WORKER_RUNTIME)
  );
}

/**
 * @returns {Promise<
 *   | {
 *       ok: true;
 *       mode: "env_executable" | "mac_chrome" | "sparticuz";
 *       executablePath: string;
 *       args: string[];
 *       headless: boolean | string;
 *       defaultViewport?: Record<string, unknown>;
 *     }
 *   | { ok: false; reason: "chromium_executable_unavailable"; error: string }
 * >}
 */
export async function resolveChromiumLaunchConfig() {
  const fromEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
  if (fromEnv) {
    return {
      ok: true,
      mode: "env_executable",
      executablePath: fromEnv,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true
    };
  }

  if (!isServerlessRuntime() && process.platform === "darwin") {
    const fs = await import("node:fs");
    if (fs.existsSync(MAC_CHROME_PATH)) {
      return {
        ok: true,
        mode: "mac_chrome",
        executablePath: MAC_CHROME_PATH,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        headless: true
      };
    }
  }

  try {
    const chromiumMod = await import("@sparticuz/chromium");
    const chromium = chromiumMod.default ?? chromiumMod;
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      return {
        ok: false,
        reason: "chromium_executable_unavailable",
        error: "@sparticuz/chromium executablePath() returned empty"
      };
    }
    return {
      ok: true,
      mode: "sparticuz",
      executablePath,
      args: Array.isArray(chromium.args)
        ? chromium.args
        : ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: chromium.headless ?? true,
      defaultViewport: chromium.defaultViewport
    };
  } catch (e) {
    const detail = String(e?.message || e);
    return {
      ok: false,
      reason: "chromium_executable_unavailable",
      error: isServerlessRuntime()
        ? `Failed to load @sparticuz/chromium on serverless runtime (${detail})`
        : `PDF renderer unavailable — set PUPPETEER_EXECUTABLE_PATH or install @sparticuz/chromium (${detail})`
    };
  }
}
