/**
 * Capture real-component screenshots for Estimate Record commercial controls v2.
 * Assumes review servers are already running on 5186 / 5199 / 5193,
 * or pass --start-servers.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, ".local/review/estimate-record-commercial-controls-v2");
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
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

async function shot(name, url, prep) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  if (prep) await prep(page);
  await page.addStyleTag({
    content:
      '[data-testid="eq-review-devbar"],[data-testid="de-review-devbar"]{display:none !important}'
  });
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  console.log("wrote", name);
}

const studio = (scenario) =>
  `http://127.0.0.1:5199/review-estimate-record.html?scenario=${scenario}&takeoffOrigin=http://127.0.0.1:5186`;

await shot("01-draft-estimate-record", studio("draft"), async (p) => {
  await p.waitForSelector('[data-testid="eq-takeoff-iframe"]');
  await p.waitForTimeout(2800);
});

await shot("02-approved-estimate-record", studio("approved"), async (p) => {
  await p.waitForSelector('[data-testid="eq-verified-estimate-section"]');
  await p.waitForTimeout(2800);
});

await shot("03-commercial-configuration", studio("commercial"), async (p) => {
  await p.waitForSelector('[data-testid="eq-custom-line-items-editor"]');
  await p.waitForSelector('[data-testid="eq-percentage-input"]');
  await p.waitForSelector('[data-testid="eq-vanity-card"]');
  await p.locator('[data-testid="eq-commercial-configuration-section"]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
});

await shot("04-published-estimate-record", studio("published"), async (p) => {
  await p.waitForSelector('[data-testid="eq-ai-published-estimate"]');
  await p.waitForTimeout(2200);
});

await shot("05-revision-history-r1-r2", studio("revision-history"), async (p) => {
  await p.waitForSelector('[data-testid="eq-revision-item"]');
  await p.waitForSelector('[data-testid="eq-revision-comparison-summary"]');
  await p.locator('[data-testid="eq-revision-history-section"]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(700);
});

await shot("06-r2-waterfall-and-custom-line", studio("r2"), async (p) => {
  await p.waitForSelector('[data-testid="eq-waterfall-card"]');
  await p.waitForSelector('[data-testid="eq-takeoff-iframe"]');
  await p.waitForTimeout(2800);
  await p.locator('[data-testid="eq-waterfall-configuration"]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
});

await shot(
  "07-digital-estimate-vanity-waterfall",
  "http://127.0.0.1:5193/review-digital-estimate.html",
  async (p) => {
    await p.waitForSelector('[data-testid="de-review-harness"]');
    await p.locator('[data-testid="de-open-specialty-modal"]').first().click({ force: true });
    await p.waitForSelector('[data-testid="de-specialty-modal"]');
    await p.getByText(/Kitchen Island — Left waterfall/i).first().click({ force: true });
    await p.locator('[data-testid="de-modal-done"]').click({ force: true }).catch(() => {});
    await p.waitForTimeout(700);
    await p.locator('[data-testid="de-open-sink-modal"]').first().click({ force: true });
    await p.waitForTimeout(600);
  }
);

await browser.close();
writeFileSync(
  join(outDir, "README.md"),
  `# Estimate Record commercial controls — v2 visual proof

Screenshots captured from production React components via local review harnesses:

- Studio: \`review-estimate-record.html\` + EliteosTopbar + Estimate Record sections
- Takeoff: ConsolidatedTakeoffReview \`?localReview=1\`
- Digital Estimate: ConfigurationView via \`review-digital-estimate.html\`

Not static HTML documentation fixtures. Do not commit this directory.
`
);
killAll();
console.log("Done →", outDir);
