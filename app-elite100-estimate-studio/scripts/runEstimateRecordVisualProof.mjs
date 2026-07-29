/**
 * Capture real-component screenshots for Estimate Record commercial controls v3.
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
const outDir = join(root, ".local/review/estimate-record-commercial-controls-v3");
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

async function waitTakeoffReady(p, { expectSf = null } = {}) {
  await p.waitForSelector('[data-testid="eq-takeoff-iframe"]');
  const frame = p.frameLocator('[data-testid="eq-takeoff-iframe"]');
  // Piece labels live in inputs — assert values, not plain text nodes.
  await frame.locator('input[value="Kitchen Island"]').first().waitFor({ timeout: 45000 });
  await frame.locator('input[value="Vanity Top"]').first().waitFor({ timeout: 20000 });
  const bodyText = await frame.locator("body").innerText();
  if (!/Kitchen|Bathroom/i.test(bodyText)) {
    throw new Error("Takeoff iframe blank — refusing screenshot");
  }
  if (expectSf != null) {
    const re = new RegExp(String(expectSf).replace(".", "\\.") + "\\s*SF countertop", "i");
    if (!re.test(bodyText)) {
      throw new Error(`Takeoff iframe missing ${expectSf} SF countertop — refusing screenshot`);
    }
  }
  const islandVal = await frame.locator('input[value="Kitchen Island"]').count();
  const vanityVal = await frame.locator('input[value="Vanity Top"]').count();
  if (islandVal < 1 || vanityVal < 1) {
    throw new Error("Takeoff iframe missing Kitchen Island / Vanity Top inputs — refusing screenshot");
  }
}

async function assertStudioProof(p, { needCommercial = false, needRevisions = false } = {}) {
  const body = await p.locator("body").innerText();
  if (needCommercial && !/Commercial Configuration/i.test(body)) {
    throw new Error("Commercial controls not visible");
  }
  if (needRevisions && !/Revision history|R1|R2/i.test(body)) {
    throw new Error("Revision cards not visible");
  }
}

async function shot(name, url, prep) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  if (prep) await prep(page);
  await page.addStyleTag({
    content: `
      [data-testid="eq-review-devbar"],
      [data-testid="de-review-devbar"]{display:none !important}
      /* Avoid sticky header duplication in full-page screenshots */
      .eliteos-topbar,
      header.eliteos-topbar,
      [data-testid="eliteos-topbar"]{
        position: static !important;
        top: auto !important;
      }
    `
  });
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  console.log("wrote", name);
}

const studio = (scenario) =>
  `http://127.0.0.1:5199/review-estimate-record.html?scenario=${scenario}&takeoffOrigin=http://127.0.0.1:5186`;

await shot("01-draft-estimate-record", studio("draft"), async (p) => {
  await waitTakeoffReady(p, { expectSf: "83.08" });
});

await shot("02-approved-estimate-record", studio("approved"), async (p) => {
  await waitTakeoffReady(p, { expectSf: "83.08" });
  await p.waitForSelector('[data-testid="eq-verified-estimate-section"]');
  const sf = await p.locator('[data-testid="eq-ai-verified-sf"]').innerText();
  if (!/83\.08/.test(sf)) throw new Error(`Verified SF expected 83.08, got ${sf}`);
  await assertStudioProof(p, { needCommercial: true });
  const islandVisible = await p.getByText("Kitchen Island").count();
  if (islandVisible < 1) throw new Error("Kitchen Island missing from approved Verified Estimate");
});

await shot("03-commercial-configuration", studio("commercial"), async (p) => {
  await p.waitForSelector('[data-testid="eq-custom-line-items-editor"]');
  await p.waitForSelector('[data-testid="eq-percentage-input"]');
  await p.waitForSelector('[data-testid="eq-vanity-card"]');
  await assertStudioProof(p, { needCommercial: true });
  const pkg = await p.locator('[data-testid="eq-vanity-package"]').inputValue();
  if (/37_S/.test(pkg)) throw new Error(`Vanity package still shows raw code: ${pkg}`);
  await p.locator('[data-testid="eq-commercial-configuration-section"]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
});

await shot("04-published-estimate-record", studio("published"), async (p) => {
  await waitTakeoffReady(p, { expectSf: "83.08" });
  await p.waitForSelector('[data-testid="eq-ai-published-estimate"]');
});

await shot("05-revision-history-r1-r2", studio("revision-history"), async (p) => {
  await p.waitForSelector('[data-testid="eq-revision-item"]');
  await p.waitForSelector('[data-testid="eq-revision-comparison-summary"]');
  await assertStudioProof(p, { needRevisions: true });
  await p.locator('[data-testid="eq-revision-history-section"]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(700);
});

await shot("06-r2-waterfall-and-custom-line", studio("r2"), async (p) => {
  await waitTakeoffReady(p, { expectSf: "87.08" });
  await p.waitForSelector('[data-testid="eq-waterfall-card"]');
  await p.waitForSelector('[data-testid="eq-de-r1-remains-active"]');
  const banner = await p.locator('[data-testid="eq-de-r1-remains-active"]').innerText();
  if (!/R1 remains active while R2/i.test(banner)) {
    throw new Error(`Unexpected R2 DE banner: ${banner}`);
  }
  await p.locator('[data-testid="eq-waterfall-configuration"]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
});

await shot(
  "07-digital-estimate-vanity-waterfall",
  "http://127.0.0.1:5193/review-digital-estimate.html",
  async (p) => {
    await p.waitForSelector('[data-testid="de-review-harness"]');
    const body = await p.locator("body").innerText();
    if (/0 approved sinks/i.test(body)) throw new Error("DE shows 0 approved sinks");
    if (/No sink/i.test(body) && /Vanity Program/i.test(body)) {
      // Bathroom must not show No sink when program applied
      const bathBlock = body.slice(body.indexOf("Bathroom"), body.indexOf("Bathroom") + 800);
      if (/No sink/i.test(bathBlock)) throw new Error("Bathroom shows No sink with Vanity Program");
    }
    // Print document must be hidden on screen
    const printVisible = await p.locator(".de-print-root").evaluateAll((nodes) =>
      nodes.some((n) => {
        const s = getComputedStyle(n);
        return s.display !== "none" && s.visibility !== "hidden";
      })
    );
    if (printVisible) throw new Error("Print document visible on screen");

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
  `# Estimate Record commercial controls — v3 visual proof

Cross-surface coherent fixture screenshots (83.08 SF, openings, totals, Vanity, R1-while-R2, print hidden).

Not static HTML documentation fixtures. Do not commit this directory.
`
);
killAll();
console.log("Done →", outDir);
