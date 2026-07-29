/**
 * Local-only screenshots for unified estimate revision v2 (not committed).
 * Run with review servers:
 *   node app-elite100-estimate-studio/scripts/runUnifiedEstimateRevisionProof.mjs --start-servers
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, ".local/review/unified-estimate-revision-v2");
const pwEntry = join(root, ".local/pw-tools/node_modules/playwright/index.mjs");
mkdirSync(outDir, { recursive: true });

const procs = [];
function killAll() {
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}
process.on("exit", killAll);

async function waitForUrl(url) {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`Timeout ${url}`);
}

if (process.argv.includes("--start-servers")) {
  function start(cwd, args) {
    const p = spawn("npx", args, { cwd, stdio: "ignore", env: process.env });
    procs.push(p);
  }
  start(join(root, "app-ai-takeoff"), ["vite", "--host", "127.0.0.1", "--port", "5186", "--strictPort"]);
  start(join(root, "app-elite100-estimate-studio"), [
    "vite",
    "--config",
    "vite.review.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    "5199",
    "--strictPort"
  ]);
  start(join(root, "app-digital-estimate"), ["vite", "--host", "127.0.0.1", "--port", "5193", "--strictPort"]);
  await waitForUrl("http://127.0.0.1:5199/review-estimate-record.html");
  await waitForUrl("http://127.0.0.1:5186/");
  await waitForUrl("http://127.0.0.1:5193/review-digital-estimate.html");
}

const { chromium } = await import(pathToFileURL(pwEntry).href);
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-site-isolation-trials", "--disable-features=IsolateOrigins,site-per-process"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const studio = (s) =>
  `http://127.0.0.1:5199/review-estimate-record.html?scenario=${s}&takeoffOrigin=${encodeURIComponent("http://127.0.0.1:5186")}`;

async function shot(name, url, prep) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  if (prep) await prep(page);
  await page.addStyleTag({
    content: `[data-testid="eq-review-devbar"],[data-testid="de-review-devbar"]{display:none!important}`
  });
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  console.log("wrote", name);
}

try {
  await shot("01-approved-r1-edit-estimate", studio("approved"), async (p) => {
    await p.waitForSelector('[data-testid="eq-edit-estimate"]');
    await p.waitForSelector('[data-testid="eq-commercial-configuration-section"][data-editable="0"]');
    const save = await p.locator('[data-testid="eq-save-commercial-changes"]').count();
    if (save !== 0) throw new Error("approved R1 must not show Save Draft");
    const inputs = await p
      .locator(
        '[data-testid="eq-commercial-configuration-section"] input:not([disabled]), [data-testid="eq-commercial-configuration-section"] select:not([disabled])'
      )
      .count();
    if (inputs !== 0) throw new Error(`approved R1 still has ${inputs} editable controls`);
  });
  await shot("02-editable-r2-takeoff-adjustments", studio("r2"), async (p) => {
    await p.waitForFunction(
      () => window.__takeoffReviewReady?.type === "TAKEOFF_REVIEW_READY",
      null,
      { timeout: 45000 }
    ).catch(() => {});
    await p.waitForSelector('[data-testid="eq-commercial-configuration-section"][data-editable="1"]');
    await p.waitForSelector('[data-testid="eq-save-commercial-changes"]');
    await p.waitForSelector('[data-testid="eq-percentage-input"]');
  });
  await shot("03-account-adjustment-3pct", studio("commercial"), async (p) => {
    await p.waitForSelector('[data-testid="eq-estimate-percentage-adjustment"]');
    await p.locator('[data-testid="eq-account-adjustment-impact"]').scrollIntoViewIfNeeded();
    const base = await p.locator('[data-testid="eq-account-adjustment-impact"] [data-testid="eq-adj-base"]').innerText();
    const basis = await p
      .locator('[data-testid="eq-account-adjustment-impact"] [data-testid="eq-adj-eligible-basis"]')
      .innerText();
    if (!/4,?122/.test(base)) throw new Error(`unexpected verified base: ${base}`);
    if (!/5,?222/.test(basis)) throw new Error(`unexpected basis: ${basis}`);
  });
  writeFileSync(
    join(outDir, "README.md"),
    `# Unified estimate revision v2 screenshots\n\nLocal review only — do not commit.\n`
  );
} finally {
  await browser.close();
  killAll();
}
