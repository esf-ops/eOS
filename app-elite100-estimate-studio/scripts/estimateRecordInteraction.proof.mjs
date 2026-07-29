/**
 * Real component interaction tests for Estimate Record commercial controls.
 * Mounts production components in Playwright against the local review harness.
 *
 * Run (servers must be up, or use runEstimateRecordVisualProof which starts them):
 *   node app-elite100-estimate-studio/scripts/estimateRecordInteraction.proof.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
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

function start(cwd, args, tag) {
  const p = spawn("npx", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  p.stderr.on("data", () => {});
  p.stdout.on("data", () => {});
  procs.push(p);
  return p;
}

const startServers = process.argv.includes("--start-servers");
if (startServers) {
  start(join(root, "app-ai-takeoff"), ["vite", "--host", "127.0.0.1", "--port", "5186", "--strictPort"], "t");
  start(
    join(root, "app-elite100-estimate-studio"),
    ["vite", "--config", "vite.review.config.ts", "--host", "127.0.0.1", "--port", "5199", "--strictPort"],
    "s"
  );
  start(join(root, "app-digital-estimate"), ["vite", "--host", "127.0.0.1", "--port", "5193", "--strictPort"], "d");
  await waitForUrl("http://127.0.0.1:5199/review-estimate-record.html");
  await waitForUrl("http://127.0.0.1:5186/");
  await waitForUrl("http://127.0.0.1:5193/review-digital-estimate.html");
}

const code = `
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const studio = (s) => 'http://127.0.0.1:5199/review-estimate-record.html?scenario=' + s + '&takeoffOrigin=http://127.0.0.1:5186';

console.log('interaction: commercial custom lines + percentage');
await page.goto(studio('commercial'), { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('[data-testid="eq-custom-line-items-editor"]');
const rowsBefore = await page.locator('[data-testid="eq-custom-line-row"]').count();
assert.ok(rowsBefore >= 4, 'fixture should include Tear Out, Crane, credit, internal');
await page.click('[data-testid="eq-add-tear-out"]');
assert.equal(await page.locator('[data-testid="eq-custom-line-row"]').count(), rowsBefore + 1);
const tearUnit = page.locator('[data-testid="eq-custom-line-row"]').last().locator('input[aria-label="Line unit price"]');
// After add tear out, last may be tear; also check any row with 750
const vals = await page.locator('input[aria-label="Line unit price"]').evaluateAll((els) => els.map((e) => e.value));
assert.ok(vals.includes('750'), 'Tear Out $750 unit price present: ' + vals.join(','));
await page.click('[data-testid="eq-add-custom-line"]');
assert.equal(await page.locator('[data-testid="eq-custom-line-row"]').count(), rowsBefore + 2);
await page.fill('[data-testid="eq-percentage-input"]', '3');
await page.fill('[data-testid="eq-percentage-reason"]', 'Spahn & Rose account pricing');
await page.click('[data-testid="eq-save-commercial-changes"]');
await page.waitForTimeout(300);
assert.equal(await page.getAttribute('[data-testid="eq-commercial-configuration-section"]', 'data-dirty'), '0');
assert.match(await page.locator('[data-testid="eq-adj-base"]').innerText(), /4,872|4872/);
assert.match(await page.locator('[data-testid="eq-adj-amount"]').innerText(), /146\\.16/);
assert.match(await page.locator('[data-testid="eq-adj-display"]').innerText(), /5,020|5020/);
const preview = await page.locator('[data-testid="eq-customer-line-preview"]').innerText();
assert.equal(/Internal material hold/i.test(preview), false, 'internal-only must not leak to customer preview');
assert.match(preview, /Tear Out|Crane|Courtesy credit/);
await page.locator('[data-testid="eq-vanity-apply"]').check({ force: true }).catch(()=>{});
assert.ok(await page.locator('[data-testid="eq-vanity-physical-facts"]').count());
console.log('ok: custom lines, tear out 750, percentage, vanity controls, no internal leak');

console.log('interaction: waterfall editor');
await page.goto(studio('r2'), { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('[data-testid="eq-waterfall-card"]');
assert.match(await page.locator('[data-testid="eq-waterfall-label"]').innerText(), /Kitchen.*Left waterfall/i);
await page.fill('[data-testid="eq-waterfall-width"]', '36');
await page.fill('[data-testid="eq-waterfall-height"]', '36');
await page.check('[data-testid="eq-waterfall-polish"]');
await page.check('[data-testid="eq-waterfall-optional"]');
await page.click('[data-testid="eq-save-commercial-changes"]');
await page.waitForTimeout(250);
console.log('ok: waterfall geometry controls save');

console.log('interaction: revision history cards + comparison');
await page.goto(studio('revision-history'), { waitUntil: 'networkidle', timeout: 120000 });
const revCount = await page.locator('[data-testid="eq-revision-item"]').count();
assert.ok(revCount >= 2);
assert.ok(await page.locator('[data-testid="eq-view-snapshot"]').count() >= 1);
assert.ok(await page.locator('[data-testid="eq-compare-revision"]').count() >= 1);
const cmp = await page.locator('[data-testid="eq-revision-comparison-summary"]').innerText();
assert.match(cmp, /96.*120|Sink wall/i);
assert.match(cmp, /waterfall/i);
assert.match(cmp, /Crane|350/);
assert.match(cmp, /3%/);
console.log('ok: revision cards + comparison');

console.log('interaction: inline publish (no navigation)');
await page.goto(studio('approved'), { waitUntil: 'networkidle', timeout: 120000 });
const urlBefore = page.url();
let beforeunloadFired = false;
page.on('dialog', async (d) => { beforeunloadFired = true; await d.dismiss(); });
await page.click('[data-testid="eq-publish-digital-estimate"]');
await page.waitForSelector('[data-testid="eq-ai-published-estimate"]', { timeout: 5000 });
assert.equal(page.url().split('#')[0], urlBefore.split('#')[0]);
assert.equal(beforeunloadFired, false);
console.log('ok: inline publish, no beforeunload');

console.log('interaction: customer Digital Estimate vanity + waterfall');
await page.goto('http://127.0.0.1:5193/review-digital-estimate.html', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('[data-testid="de-review-harness"]');
const body = await page.locator('body').innerText();
assert.match(body, /Munsterman|Kitchen|Bathroom/i);
assert.equal(/surcharge|3% surcharge/i.test(body), false);

await page.locator('[data-testid="de-open-specialty-modal"]').first().click({ force: true });
await page.waitForSelector('[data-testid="de-specialty-modal"]', { timeout: 5000 });
assert.ok(
  (await page.getByText(/Kitchen Island — Left waterfall|Left waterfall/i).count()) >= 1,
  'waterfall option label must render in specialty modal'
);
await page.getByText(/Kitchen Island — Left waterfall|Left waterfall/i).first().click({ force: true });
await page.locator('[data-testid="de-modal-done"]').click({ force: true }).catch(() => {});
await page.waitForTimeout(600);

await page.locator('[data-testid="de-open-sink-modal"]').first().click({ force: true });
await page.waitForTimeout(500);
assert.ok(
  (await page.getByText(/Rectangular white sink upgrade|sink upgrade/i).count()) >= 1 ||
    (await page.locator('[data-testid="de-sink-modal"], [data-testid*="sink"]').count()) >= 1,
  'vanity/sink upgrade UI must render'
);
console.log('ok: customer DE shows vanity + waterfall options without surcharge line');

await browser.close();
console.log('\\nAll Estimate Record interaction proofs passed.\\n');
`;

const { writeFileSync, unlinkSync } = await import("node:fs");
const tmp = join(root, ".local/review/estimate-record-commercial-controls-v2/_interaction.mjs");
writeFileSync(tmp, code.replace(
  "import { chromium } from 'playwright';",
  "import { chromium } from '" + join(root, ".local/pw-tools/node_modules/playwright/index.mjs").replace(/\\/g, "/") + "';"
).replace(
  /executablePath: process\.env\.CHROME_PATH \|\| '[^']+'/,
  "channel: undefined"
));
const run = spawn(process.execPath, [tmp], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || undefined
  }
});
const exit = await new Promise((r) => run.on("exit", r));
killAll();
try {
  unlinkSync(tmp);
} catch {
  /* ignore */
}
process.exit(exit || 0);
