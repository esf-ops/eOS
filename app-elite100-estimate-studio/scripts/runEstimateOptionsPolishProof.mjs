/**
 * Local-only Estimate Options polish screenshots (not committed).
 *   node app-elite100-estimate-studio/scripts/runEstimateOptionsPolishProof.mjs --start-servers
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, ".local/review/estimate-options-polish");
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
  const el = page.locator('[data-testid="eq-commercial-configuration-section"]');
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: join(outDir, `${name}.png`) });
  console.log("wrote", name);
}

try {
  await shot("01-empty-estimate-options", studio("draft"), async (p) => {
    await p.waitForSelector('[data-testid="eq-commercial-configuration-section"]');
    await p.waitForSelector('[data-testid="eq-lines-empty"]');
  });

  await shot("02-account-adjustment-active", studio("commercial"), async (p) => {
    await p.waitForSelector('[data-testid="eq-account-adjustment-impact"]');
    await p.locator('[data-testid="eq-estimate-percentage-adjustment"]').scrollIntoViewIfNeeded();
  });

  await shot("03-vanity-eligible", studio("commercial"), async (p) => {
    await p.waitForSelector('[data-testid="eq-vanity-card"]');
    const remove = p.locator('[data-testid="eq-vanity-remove"]');
    if (await remove.count()) await remove.first().click();
    await p.waitForSelector('[data-testid="eq-vanity-eligible-offer"], [data-testid="eq-vanity-apply"]');
  });

  await shot("04-vanity-applied-customer-choices", studio("commercial"), async (p) => {
    await p.waitForSelector('[data-testid="eq-vanity-permitted-options"], [data-testid="eq-vanity-package"]');
    const apply = p.locator('[data-testid="eq-vanity-apply"]');
    if (await apply.count()) await apply.first().click();
    await p.waitForSelector('[data-testid="eq-vanity-permitted-options"]');
  });

  await shot("05-island-waterfall-actions", studio("draft"), async (p) => {
    await p.waitForSelector('[data-testid="eq-add-left-waterfall-option"]');
    await p.locator('[data-testid="eq-waterfall-configuration"]').scrollIntoViewIfNeeded();
  });

  await shot("06-waterfall-configured", studio("r2"), async (p) => {
    await p.waitForSelector('[data-testid="eq-waterfall-card"], [data-testid="eq-waterfall-commercial-controls"]');
    await p.locator('[data-testid="eq-waterfall-configuration"]').scrollIntoViewIfNeeded();
  });

  await shot("07-full-estimate-options", studio("commercial"), async (p) => {
    await p.waitForSelector('[data-testid="eq-commercial-configuration-section"]');
    await p.waitForSelector('[data-testid="eq-options-draft-total"]');
  });

  writeFileSync(
    join(outDir, "README.md"),
    `# Estimate Options polish screenshots\n\nLocal review only — do not commit.\n`
  );
} finally {
  await browser.close();
  killAll();
}
